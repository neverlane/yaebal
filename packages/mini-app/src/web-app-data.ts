/**
 * parse a `message.web_app_data.data` payload (sent by `Telegram.WebApp.sendData()`) as JSON.
 * telegram warns this field is client-controlled — validate the shape of `T` as you would any
 * other untrusted input.
 */
export function parseWebAppData<T = unknown>(data: string): T {
	try {
		return JSON.parse(data) as T;
	} catch (error) {
		throw new Error(`mini-app: web_app_data.data is not valid JSON: ${(error as Error).message}`);
	}
}
