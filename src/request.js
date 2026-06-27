import { $app, Console, done } from "@nsnanocat/util";
import { Request } from "./process/Request.mjs";

let $response;

!(async () => {
	({ $request, $response } = await Request($request));
})()
	.catch(error => Console.error(error))
	.finally(() => {
		switch (typeof $response) {
			case "object":
				if ($response.headers?.["Content-Encoding"]) $response.headers["Content-Encoding"] = "identity";
				if ($response.headers?.["content-encoding"]) $response.headers["content-encoding"] = "identity";
				switch ($app) {
					case "Quantumult X":
						if (!$response.status) $response.status = 200;
						delete $response.headers?.["Content-Length"];
						delete $response.headers?.["content-length"];
						delete $response.headers?.["Transfer-Encoding"];
						done($response);
						break;
					default:
						done({ response: $response });
						break;
				}
				break;
			case "undefined":
				done($request);
				break;
			default:
				Console.error(`Invalid $response type: ${typeof $response}`);
				break;
		}
	});
