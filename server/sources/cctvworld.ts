import { BASE_URL, createCctvSource } from "./utils/cctv"

export default createCctvSource({
  jsonpEndpoints: [
    `${BASE_URL}/2019/07/gaiban/cmsdatainterface/page/world_1.jsonp?cb=world`,
  ],
  htmlPaths: [`${BASE_URL}/world/`],
  errorMessage: "Failed to fetch CCTV News (World) feed",
})
