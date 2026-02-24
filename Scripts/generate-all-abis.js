import { saveAbi } from "./update-frontend.js";

// Generate all ABIs that may be needed by the frontend
console.log("Generating all contract ABIs for frontend...");

saveAbi("DexFactory");
saveAbi("DexRouter");
saveAbi("DexPair");
saveAbi("LPToken");
saveAbi("TestToken");

console.log("All ABIs generated successfully!");