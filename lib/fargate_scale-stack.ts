import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdajs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import { aws_applicationautoscaling, Duration } from 'aws-cdk-lib';
import path = require('path');

export class FargateScaleStack extends cdk.Stack {
  constructor(scope: Construct, id: string, props?: cdk.StackProps) {
    super(scope, id, props);

    // The code that defines your stack goes here

    // IAM permissions for metric Lambda
    const policyStatement = new iam.PolicyStatement({
      effect: iam.Effect.ALLOW,
      actions: ["cloudwatch:PutMetricData"],
      resources: ["*"],
    });

    // Cloudwatch custom metric for Redis queue length
    const metric = new cloudwatch.Metric({
      namespace: "redisQueueLengthNamespace",
      metricName: "redisQueueLength",
    });

    // Lambda to publish Cloudwatch custom metric
    const lambdaCloudWatch = new lambdajs.NodejsFunction(
      this,
      "lambdaCloudWatch",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        memorySize: 1024,
        timeout: Duration.seconds(3),
        entry: path.join(__dirname, "../src/app.js"),
        handler: "main",
        environment: {
          Metric: metric.metricName,
        },
        initialPolicy: [policyStatement],
      }
    );

    // Application Load Balancer (ALB) and
    // Fargate service IaC below

    const vpc = new ec2.Vpc(this, "MyVpc", {
      maxAzs: 3, // Default is all AZs in region
    });

    const cluster = new ecs.Cluster(this, "MyCluster", {
      vpc: vpc,
    });

    // Create a load-balanced Fargate service and make it public
    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      "MyFargateService",
      {
        cluster: cluster, // Required
        cpu: 256, // Default is 256
        desiredCount: 2, // Default is 1
        taskImageOptions: {
          image: ecs.ContainerImage.fromRegistry(
            "amazon/amazon-ecs-sample"
          ),
        },
        memoryLimitMiB: 512, // Default is 512
        publicLoadBalancer: true, // Default is true
      }
    );

    const scaling = service.service.autoScaleTaskCount({
      maxCapacity: 10,
      minCapacity: 1,
    });

    // get metric here
    const cpuUtilization = service.service.metricCpuUtilization();

    // scale based on metric
    scaling.scaleOnMetric("autoscale_cpu", {
      metric: cpuUtilization,
      scalingSteps: [
        { upper: 10, change: -1 },
        { lower: 50, change: +1 },
        { lower: 70, change: +3 },
      ],
      adjustmentType:
        aws_applicationautoscaling.AdjustmentType.CHANGE_IN_CAPACITY,
    });

  }
}