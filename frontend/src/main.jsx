import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter, Routes, Route, useParams } from "react-router-dom";
import Respond from "./Respond.jsx";
import Control from "./Control.jsx";
import Display from "./Display.jsx";
import CandCStudent from "./candc/Student.jsx";
import CandCLecturer from "./candc/Lecturer.jsx";
import CandCPresentation from "./candc/Presentation.jsx";
import { CANDC_PUBLIC_ALIASES } from "./candc/public-aliases.js";
import "./styles.css";
import "./flow.css";
import "./candc/candc.css";

function normalizeLegacyHashRoute() {
  const hash = window.location.hash;
  if (hash.startsWith("#/")) {
    window.history.replaceState(null, "", hash.slice(1));
  }
}

function SuppliedLink() {
  return <div className="wrap"><p className="muted">Open a supplied activity link.</p></div>;
}

function PublicCandCStudent() {
  const { alias } = useParams();
  if (!CANDC_PUBLIC_ALIASES[String(alias || "").toLowerCase()]) return <SuppliedLink />;
  return <CandCStudent />;
}

normalizeLegacyHashRoute();

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/respond/:id" element={<Respond />} />
        <Route path="/control/:id" element={<Control />} />
        <Route path="/display/:id" element={<Display />} />
        <Route path="/stage3/respond/:id" element={<CandCStudent />} />
        <Route path="/stage3/control/:id" element={<CandCLecturer />} />
        <Route path="/stage3/display/:id" element={<CandCPresentation />} />
        <Route path="/:alias" element={<PublicCandCStudent />} />
        <Route path="*" element={<SuppliedLink />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
);
