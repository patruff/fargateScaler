# Fargate scaling based on Redis queue size

This is a project for CDK development with TypeScript.
The aim is to scale an ECS cluster based on the queue size from
a Redis (Elasticache) cluster.

## Running the IaC

* Clone the repo
* Install packages (npm install)
* Update the bin/fargate_scale.ts file with your AWS account and region

## Infrastructure (not exhaustive)

Fargate behind an ALB (in 3 different availability zones)
Elasticache on EC2 (in one specific availability zone)
Custom Cloudwatch metric to scale on (queue size)
Lambda to access the Elasticache cluster and output the custom metric to Cloudwatch
Interface endpoint that allows the Lambda (in private subnet) to reach out to Cloudwatch

## Useful commands

* `git clone`   clone this repo
* `npm install`   install all of the packages needed
* `npx aws-cdk deploy`      deploy this stack to your default AWS account/region
* `npx aws-cdk diff`        compare deployed stack with current state
* `npx aws-cdk synth`       emits the synthesized CloudFormation template
