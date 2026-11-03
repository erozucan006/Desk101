import { StrictMode, lazy, Suspense } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";

// "/" is the product page, "/desk" is the terminal. Old links with ?demo=1 on "/" go to the desk.
const path = location.pathname.replace(/\/+$/, "");
if (path === "" && new URLSearchParams(location.search).has("demo")) history.replaceState(null, "", "/desk" + location.search);
const onDesk = location.pathname.startsWith("/desk");

const App = lazy(() => import("./App"));
const Landing = lazy(() => import("./landing/Landing"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Suspense fallback={null}>{onDesk ? <App /> : <Landing />}</Suspense>
  </StrictMode>,
);
