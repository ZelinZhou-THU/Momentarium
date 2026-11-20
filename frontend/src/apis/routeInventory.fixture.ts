import rawInventory from "../../../docs/api-routes.json?raw";
import { requireArray, requireBoolean, requireObject, requireString } from "./shared/decode";

/** 仅供契约测试：与后端真实 RouteRegistry 对比同一份可执行清单。 */
export const MESSAGE_ROUTE_INVENTORY = requireArray(JSON.parse(rawInventory) as unknown, "routes").map((value, index) => {
  const path = `routes[${index}]`;
  const route = requireObject(value, path);
  return {
    service: requireString(route.service, `${path}.service`),
    routeName: requireString(route.routeName, `${path}.routeName`),
    requiresRequestBody: requireBoolean(route.requiresRequestBody, `${path}.requiresRequestBody`),
    apiClass: requireString(route.apiClass, `${path}.apiClass`),
  };
});
