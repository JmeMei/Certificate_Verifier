// src/App.jsx
// -----------
// The app shell: title + two tabs. Which "page" shows is just a piece of
// React state — no router library needed for a two-page app. (If the app
// grew more pages, react-router with real URLs like /admin would be the
// upgrade; one line for the report's future work.)

import { useState } from "react";
import VerifyPage from "./VerifyPage";
import AdminPage from "./AdminPage";
import "./App.css";

function App() {
  const [page, setPage] = useState("verify"); // "verify" | "admin"

  return (
    <div className="page">
      <header>
        <h1>🎓 Certificate Verifier</h1>
        <nav className="tabs">
          <button
            className={page === "verify" ? "tab active" : "tab"}
            onClick={() => setPage("verify")}
          >
            Verify
          </button>
          <button
            className={page === "admin" ? "tab active" : "tab"}
            onClick={() => setPage("admin")}
          >
            University Admin
          </button>
        </nav>
      </header>

      {page === "verify" ? <VerifyPage /> : <AdminPage />}
    </div>
  );
}

export default App;
