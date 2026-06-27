import { Console, done } from "@nsnanocat/util";
import { Response } from "./process/Response.dev.mjs";

!(async () => {
	$response = await Response($request, $response);
})()
	.catch(error => Console.error(error))
	.finally(() => done($response));
