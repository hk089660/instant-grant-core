type PagesFunctionContext = {
  request: Request;
  next: () => Response | Promise<Response>;
};

export async function onRequest(context: PagesFunctionContext): Promise<Response> {
  const { request } = context;
  const url = new URL(request.url);

  // Proxy only these prefixes to Worker
  const isApi = url.pathname.startsWith("/api/");
  const isV1 = url.pathname.startsWith("/v1/");
  const isHealth = url.pathname === "/health";

  if (!(isApi || isV1 || isHealth)) {
    return context.next();
  }

  const WORKER_ORIGIN = "https://we-ne-school-api.haruki-kira3.workers.dev";
  const target = new URL(url.pathname + url.search, WORKER_ORIGIN);

  const init: RequestInit = {
    method: request.method,
    headers: request.headers,
    body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
    redirect: "manual",
  };

  return fetch(target.toString(), init);
}
