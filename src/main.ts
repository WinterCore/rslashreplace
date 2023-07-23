import WebSocket from "ws";
import {promises as fs} from "fs";
import path from "path";

const sleep = (ms: number) => new Promise((res) => setTimeout(res, ms));

const resp = await fetch("https://www.reddit.com/r/place/?screenmode=preview", {
    headers: {
        "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
    },
});

const body = await resp.text();
const token =/"accessToken"\s*:\s*"(?<token>[^"]+)"/.exec(body)?.groups?.token?.trim();

if (! token) {
    console.error("Could not extract token!");
    process.exit();
}

init().catch(console.error);

async function init() {
    const ws = new WebSocket("wss://gql-realtime-2.reddit.com/query", {
        headers: {
            origin: "https://garlic-bread.reddit.com",
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        },
        timeout: 30 * 1000,
    });

    let pingTimeout: any = undefined;

    function heartbeat() {
        console.log("Ping");
        if (pingTimeout !== undefined) {
            clearTimeout(pingTimeout);
        }

        pingTimeout = setTimeout(async () => {
            console.log("Timeout reached! Connection terminated!");
            ws.terminate();
            console.log("Reconnecting...");            
            await sleep(2000);
            init().catch(console.error);
        }, 25 * 1000);
    }


    ws.on('error', console.error);
    ws.on('open', heartbeat);
    ws.on('ping', heartbeat);
    ws.on('close', async () => {
        console.log("Connection closed! Reconnecting...");
        ws.terminate();
        await sleep(2000);
        clearTimeout(pingTimeout)
        init().catch(console.error);
    });

    ws.on('open', function open() {
        const init_payload = { type: "connection_init", payload: { Authorization: `Bearer ${token}` } };
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

        const getLSubscribeGqlPayload = (tag: number) => ({"id":`${tag + 1}`,"type":"start","payload":{"variables":{"input":{"channel":{"teamOwner":"GARLICBREAD","category":"CANVAS","tag": `${tag}` }}},"extensions":{},"operationName":"replace","query":"subscription replace($input: SubscribeInput!) {\n  subscribe(input: $input) {\n    id\n    ... on BasicMessage {\n      data {\n        __typename\n        ... on FullFrameMessageData {\n          __typename\n          name\n          timestamp\n        }\n        ... on DiffFrameMessageData {\n          __typename\n          name\n          currentTimestamp\n          previousTimestamp\n        }\n      }\n      __typename\n    }\n    __typename\n  }\n}\n"}});
        ws.send(JSON.stringify(getLSubscribeGqlPayload(0)));
        ws.send(JSON.stringify(getLSubscribeGqlPayload(1)));
        ws.send(JSON.stringify(getLSubscribeGqlPayload(2)));
        ws.send(JSON.stringify(getLSubscribeGqlPayload(3)));
        ws.send(JSON.stringify(getLSubscribeGqlPayload(4)));
        ws.send(JSON.stringify(getLSubscribeGqlPayload(5)));
    });

    ws.on('message', function message(data) {
        const payload = JSON.parse(data.toString());
        const innerData = payload?.payload?.data?.subscribe?.data;
        const id = payload?.payload?.data?.subscribe?.id;

        // Ping
        if (payload.type === "ka") {
            heartbeat();
            return;
        }

        if (! id || ! innerData) {
            console.log("Ignored message", JSON.stringify(payload));
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
}

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
