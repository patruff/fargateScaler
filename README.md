# Fargate scaling based on Redis queue size

This is a project for CDK development with TypeScript.
The aim is to scale an ECS cluster based on the queue size from
a Redis (Elasticache) cluster.

## Infrastructure

Fargate behind an ALB
Custom Cloudwatch metric to scale on (queue length)

Elasticache cluster
Lambda to access the cluster and output metric to Cloudwatch

The `cdk.json` file tells the CDK Toolkit how to execute your app.

## Useful commands

* `npm run build`   compile typescript to js
* `npm run watch`   watch for changes and compile
* `npm run test`    perform the jest unit tests
* `cdk deploy`      deploy this stack to your default AWS account/region
* `cdk diff`        compare deployed stack with current state
* `cdk synth`       emits the synthesized CloudFormation template
