const AWS = require('aws-sdk');
const cloudwatch = new AWS.CloudWatch({
    apiVersion: '2010-08-01',
    endpoint: "https://monitoring.us-east-1.amazonaws.com",
    region: "us-east-1"
});

const { createClient } = require("redis");

// get the redis URL
const client = createClient({
  url: process.env.CACHE_URL,
});

export async function main(event, context) {

    // connect to the cache
  await client.connect();
  try {
    if (!event["params"]) {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error:
            "You must provide required property 'params' for this function to execute.",
        }),
      };
    }

    const params = event["params"];
    let message = "";

    // validate event type
    if (params["type"] !== "set" &&  params["type"] !== "get") {
      return {
        statusCode: 401,
        body: JSON.stringify({
          error: `Event of type ${params["type"]} not supported. Only 'set' and 'get' event types are supported.`,
        }),
      };
    } else {
      if (params["type"] === "set") {
        if (!params["key"] && !params["value"]) {
          return {
            statusCode: 401,
            body: JSON.stringify({
              error:
                "Missing 'key' and 'value' properties for event of type 'set'",
            }),
          };
        }

        // set data to cache
        await client.set(params["key"], params["value"]);
        message = "ok.";
      } else {
        if (!params["key"]) {
          return {
            statusCode: 401,
            body: JSON.stringify({
              error: "Missing 'key' property for event of type 'get'",
            }),
          };
        }

        // retrieve data from cache
        const value = await client.get(params["key"]);
        message = `Cache value for key '${params["key"]}' is '${value}'`;

        // metrics stuff below
        let metricParams = {
            MetricData: [],
            Namespace: 'redisQueueSizeNamespace'
        }
          
        metricParams.MetricData.push({
          "MetricName": "redisQueueSize",
          "Dimensions": [
            { "Name": "redisQueueSize", "Value": "The length of the queue" },
          ],
          "Unit": "Count",
          "Value": Number(value)
        });

        // so what we need is to make a new object for pushing metrics
        // GET the value from elasticache every minute
        // then use ${value} which is the queue length

        console.log(`just set the metric to '${value}'`);
        console.log(await cloudwatch.putMetricData(metricParams).promise());

      }
    }

    // return success
    return {
      statusCode: 200,
      body: JSON.stringify({ message }),
    };
  } catch (error) {
    //   log errors that occur
    console.log(error);
  } finally {
    // disconnect the client
    await client.disconnect();
  }

};
