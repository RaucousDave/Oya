import { createApp } from "./create-app";

const app = await createApp();
await app.listen(process.env.PORT ?? 3000);
