import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as ec2 from "aws-cdk-lib/aws-ec2";
import * as iam from "aws-cdk-lib/aws-iam";
import * as ecs from "aws-cdk-lib/aws-ecs";
import * as lambda from "aws-cdk-lib/aws-lambda";
import * as lambdajs from "aws-cdk-lib/aws-lambda-nodejs";
import * as cloudwatch from "aws-cdk-lib/aws-cloudwatch";
import * as targets from "@aws-cdk/aws-events-targets";
import * as events from "@aws-cdk/aws-events";
import * as elasticcache from "aws-cdk-lib/aws-elasticache";
import * as ecs_patterns from "aws-cdk-lib/aws-ecs-patterns";
import { aws_applicationautoscaling, Duration } from 'aws-cdk-lib';
import path = require('path');
import { ManagedPolicy, Role, ServicePrincipal } from 'aws-cdk-lib/aws-iam';

const stackName = "FargateScaleStack";

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
      namespace: "redisQueueSizeNamespace",
      metricName: "redisQueueSize",
    });

    // VPC setup for ECS and EC2
    const vpc = new ec2.Vpc(this, `${stackName}Vpc`, {
      maxAzs: 1,
      cidr: "10.32.0.0/24",
      natGateways: 1,
      subnetConfiguration: [
        {
          name: `${stackName}PublicSubnet`,
          subnetType: ec2.SubnetType.PUBLIC,
        },
        {
          name: `${stackName}PrivateSubnet`,
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
      ],
    });

    // Elasticache setup

    const redisSubnetGroup = new elasticcache.CfnSubnetGroup(
      this,
      `${stackName}redisSubnetGroup`,
      {
        description: "Subnet group for the redis cluster",
        subnetIds: vpc.publicSubnets.map((ps) => ps.subnetId),
        cacheSubnetGroupName: "GT-Redis-Subnet-Group",
      }
    );

    const redisSecurityGroup = new ec2.SecurityGroup(
      this,
      `${stackName}redisSecurityGroup`,
      {
        vpc: vpc,
        allowAllOutbound: true,
        description: "Security group for the redis cluster",
      }
    );

    // further Elasticache setup

    // previous code
    const redisCache = new elasticcache.CfnCacheCluster(
      this,
      `${stackName}redisCache`,
      {
        engine: "redis",
        cacheNodeType: "cache.t3.micro",
        numCacheNodes: 1,
        clusterName: "GT-Dev-Cluster",
        vpcSecurityGroupIds: [redisSecurityGroup.securityGroupId],
        cacheSubnetGroupName: redisSubnetGroup.ref,
        engineVersion: "6.2",
        preferredMaintenanceWindow: "fri:00:30-fri:01:30",
      }
    );

    redisCache.addDependency(redisSubnetGroup);

    new cdk.CfnOutput(this, `${stackName}CacheEndpointUrl`, {
      value: redisCache.attrRedisEndpointAddress,
    });

    new cdk.CfnOutput(this, `${stackName}CachePort`, {
      value: redisCache.attrRedisEndpointPort,
    });

    // Lambda consumer IAM and security group

    const lambdaRole = new Role(this, `${stackName}lambdaRole`, {
      assumedBy: new ServicePrincipal("lambda.amazonaws.com"),
    });

    lambdaRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName("AmazonElastiCacheFullAccess")
    );

    lambdaRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaENIManagementAccess"
      )
    );

    lambdaRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaBasicExecutionRole"
      )
    );

    lambdaRole.addManagedPolicy(
      ManagedPolicy.fromAwsManagedPolicyName(
        "service-role/AWSLambdaVPCAccessExecutionRole"
      )
    );

    const lambdaSG = new ec2.SecurityGroup(this, `${stackName}lambdaSG`, {
      vpc: vpc,
      allowAllOutbound: true,
      securityGroupName: "redis-lambdaFn Security Group",
    });

    lambdaSG.connections.allowTo(
      redisSecurityGroup,
      ec2.Port.tcp(6379),
      "Allow this lambda function connect to the redis cache"
    );

    // Add an interface endpoint
    vpc.addInterfaceEndpoint("CloudwatchFromLambdaEndpoint", {
      service: ec2.InterfaceVpcEndpointAwsService.CLOUDWATCH_MONITORING,
    });

    // Lambda to publish Cloudwatch custom metric
    const lambdaCloudWatch = new lambdajs.NodejsFunction(
      this,
      "lambdaCloudWatch",
      {
        runtime: lambda.Runtime.NODEJS_14_X,
        role: lambdaRole,
        securityGroups: [lambdaSG],
        vpc: vpc,
        vpcSubnets: {
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
        },
        memorySize: 1024,
        timeout: Duration.seconds(3),
        entry: path.join(__dirname, "../src/app.js"),
        handler: "main",
        environment: {
          Metric: metric.metricName,
          CACHE_URL: `redis://${redisCache.attrRedisEndpointAddress}:${redisCache.attrRedisEndpointPort}`,
        },
        initialPolicy: [policyStatement],
      }
    );

    // Event Rule to trigger the Lambda every minute
    // const eventRule = new events.Rule(this, "scheduleRule", {
    //   schedule: events.Schedule.cron({ minute: "1", hour: "0" }),
    // });
    // eventRule.addTarget(new targets.LambdaFunction(lambdaCloudWatch));

    // Application Load Balancer (ALB) and
    // Fargate service IaC below

    const vpc2 = new ec2.Vpc(this, "MyVpc", {
       maxAzs: 3, // Default is all AZs in region
     });

    const cluster = new ecs.Cluster(this, "MyCluster", {
      vpc: vpc2,
    });

    // Create a load-balanced Fargate service and make it public
    const service = new ecs_patterns.ApplicationLoadBalancedFargateService(
      this,
      "MyFargateService",
      {
        cluster: cluster, // Required
        cpu: 256, // Default is 256
        desiredCount: 1, // Default is 1
        taskImageOptions: {
          image: ecs.ContainerImage.fromRegistry("amazon/amazon-ecs-sample"),
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
    // const cpuUtilization = service.service.metricCpuUtilization();

    // scale based on metric
    // if metric is below 10 scale in
    // if metric is above 50 scale out
    scaling.scaleOnMetric("autoscale_queuesize", {
      metric: metric,
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
