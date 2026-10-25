let reads = 0;
const API_KEY_REQUESTS_MAPPER = {}; // { pathName : {key: [ requests ]} }
const PATH_NAME = "/work";
const KEY = "org-a/channel-1/page-1";

// Simulate DB call with setTimeout
async function dbCall({ pathname, key }) {
  const response = await new Promise((resolve) => {
    // DATA RESOLVE
    setTimeout(() => {
      if (pathname === PATH_NAME && key === KEY)
        resolve({
          status: 200,
          body: "Success",
        });
      else {
        resolve({
          status: 404,
          error: "No API found",
        });
      }
    }, 250);
  });

  API_KEY_REQUESTS_MAPPER[pathname][key].forEach((resolve) => {
    resolve(response);
  });
  delete API_KEY_REQUESTS_MAPPER[pathname][key];
}

export async function handle({ url, ctx }) {
  try {
    const pathname = url.pathname;
    const key = url.searchParams.get("key") || "org-a/channel-1/page-1";

    const pendingReqLength = API_KEY_REQUESTS_MAPPER?.[pathname]?.[key]?.length;
    let response;

    if (pendingReqLength) {
      response = await new Promise((resolve) => {
        API_KEY_REQUESTS_MAPPER[pathname][key] = [
          ...API_KEY_REQUESTS_MAPPER?.[pathname]?.[key],
          resolve,
        ];
      });
    } else {
      reads++;
      response = await new Promise((resolve) => {
        API_KEY_REQUESTS_MAPPER[pathname] ??= {};
        API_KEY_REQUESTS_MAPPER[pathname][key] = [resolve];
        dbCall({ pathname, key });
      });
    }

    return response;
  } catch (error) {
    return error;
  }
}
export function inspect() {
  return { reads };
}
export function reset() {
  reads = 0;
}
