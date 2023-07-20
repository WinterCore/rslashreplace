import WebSocket from "ws";
import {promises as fs} from "fs";
import path from "path";

const ws = new WebSocket("wss://gql-realtime-2.reddit.com/query", {
    headers: {
        origin: "https://garlic-bread.reddit.com",
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    },
});

const TOKEN = process.env.AUTH_TOKEN;


ws.on('error', console.error);

ws.on('open', function open() {
    const init_payload = { type: "connection_init", payload: { Authorization: TOKEN } };
    const gqlPayload = {
       "id":"1",
       "type":"start",
       "payload":{
          "variables":{
             "input":{
                "channel":{
                   "teamOwner":"GARLICBREAD",
                   "category":"CONFIG"
                }
             }
          },
          "extensions":{
             
          },
          "operationName":"configuration",
          "query":"subscription configuration($input: SubscribeInput!) {\n  subscribe(input: $input) {\n    id\n    ... on BasicMessage {\n      data {\n        __typename\n        ... on ConfigurationMessageData {\n          colorPalette {\n            colors {\n              hex\n              index\n              __typename\n            }\n            __typename\n          }\n          canvasConfigurations {\n            index\n            dx\n            dy\n            __typename\n          }\n          activeZone {\n            topLeft {\n              x\n              y\n              __typename\n            }\n            bottomRight {\n              x\n              y\n              __typename\n            }\n            __typename\n          }\n          canvasWidth\n          canvasHeight\n          adminConfiguration {\n            maxAllowedCircles\n            maxUsersPerAdminBan\n            __typename\n          }\n          __typename\n        }\n      }\n      __typename\n    }\n    __typename\n  }\n}\n"
        }
    };
    ws.send(JSON.stringify(init_payload));

    const subscribeGqlPayload = {"id":"2","type":"start","payload":{"variables":{"input":{"channel":{"teamOwner":"GARLICBREAD","category":"CANVAS","tag":"4"}}},"extensions":{},"operationName":"replace","query":"subscription replace($input: SubscribeInput!) {\n  subscribe(input: $input) {\n    id\n    ... on BasicMessage {\n      data {\n        __typename\n        ... on FullFrameMessageData {\n          __typename\n          name\n          timestamp\n        }\n        ... on DiffFrameMessageData {\n          __typename\n          name\n          currentTimestamp\n          previousTimestamp\n        }\n      }\n      __typename\n    }\n    __typename\n  }\n}\n"}}
    ws.send(JSON.stringify(subscribeGqlPayload));
});

ws.on('message', function message(data) {
    const payload = JSON.parse(data.toString());
    const innerData = payload?.payload?.data?.subscribe?.data;
    const id = payload?.payload?.data?.subscribe?.id;

    if (! id || ! innerData) {
        console.log("Ignored message", payload);
        return;
    }

    if (innerData.__typename === "FullFrameMessageData") {
        const timestamp = innerData.timestamp;
        const url = innerData.name;
        writeFrame("full", id, url, timestamp, innerData)
            .then(() => {
                console.log("Full Frame Written: ", url, new Date(timestamp))
            }).catch((e) => {
                console.error("Failed to write frame", id, new Date(timestamp), e)
            });
    } else if (innerData.__typename === "DiffFrameMessageData") {
        const timestamp = innerData.currentTimestamp;
        const url = innerData.name;
        writeFrame("diff", id, url, timestamp, innerData)
            .then(() => {
                console.log("Diff Frame Written: ", url, new Date(timestamp))
            }).catch((e) => {
                console.error("Failed to write frame", id, new Date(timestamp), e)
            });
    }
});

async function writeFrame(type: "diff" | "full", id: string, url: string, timestamp: number, metadata: any) {
    const basePath = path.resolve(`./data/${timestamp}---${id}---${type}`);
    const imagePath = `${basePath}.png`;
    const metaPath = `${basePath}.json`;

    const imageResp = await fetch(url);
    const buffer = await imageResp.arrayBuffer();

    await Promise.all([
        fs.writeFile(imagePath, Buffer.from(buffer)),
        fs.writeFile(metaPath, JSON.stringify(metadata)),
    ]);
}
