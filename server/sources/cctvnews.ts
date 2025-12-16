import { BASE_URL, createCctvSource } from "./cctv-shared"

export default createCctvSource({
  jsonpEndpoints: [
    `${BASE_URL}/2019/07/gaiban/cmsdatainterface/page/china_1.jsonp?cb=china`,
  ],
  htmlPaths: [`${BASE_URL}/china/`],
  errorMessage: "Failed to fetch CCTV News (China) feed",
})
