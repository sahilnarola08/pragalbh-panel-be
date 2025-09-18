import dotenv from "dotenv";
import app from "./app.js";

const envFile = process.env.NODE_ENV === 'production' ? 'env.prod' : 
                process.env.NODE_ENV === 'staging' ? 'env.staging' : 'env.dev';
dotenv.config({ path: envFile });

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`API Documentation: http://localhost:${PORT}`);
});