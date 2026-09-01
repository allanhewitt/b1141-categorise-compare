import React from "react";
import ReactDOM from "react-dom/client";
import { HashRouter, Routes, Route } from "react-router-dom";
import Respond from "./Respond.jsx";
import Control from "./Control.jsx";
import Display from "./Display.jsx";
import CandCStudent from "./candc/Student.jsx";
import CandCLecturer from "./candc/Lecturer.jsx";
import CandCPresentation from "./candc/Presentation.jsx";
import "./styles.css";
import "./flow.css";
import "./candc/candc.css";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <Routes>
        <Route path="/respond/:id" element={<Respond />} />
        <Route path="/control/:id" element={<Control />} />
        <Route path="/display/:id" element={<Display />} />
        <Route path="/stage3/respond/:id" element={<CandCStudent />} />
        <Route path="/stage3/control/:id" element={<CandCLecturer />} />
        <Route path="/stage3/display/:id" element={<CandCPresentation />} />
        <Route
          path="*"
          element={
            <div className="wrap">
              <p className="muted">
                Open a supplied activity link.
              </p>
            </div>
          }
        />
      </Routes>
    </HashRouter>
  </React.StrictMode>
);
