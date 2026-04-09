import React from "react";
import "./TaglineSection.css";

const TaglineSection = () => {
  return (
    <div className="tagline-card">
      <div className="tagline-content">
        <h3>💊 Track. Manage. Grow.</h3>
        <p>
          Streamline your medicine inventory with smart management that scales
          with your pharmacy.
        </p>
        <div className="company-badge">
          <span className="powered-by">Powered by</span>
          <span className="company-name">Telusko</span>
        </div>
      </div>
    </div>
  );
};

export default TaglineSection;
