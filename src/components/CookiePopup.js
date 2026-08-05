import React from 'react';
import './CookiePopup.css';

export function CookiePopup({ onAccept }) {
  return (
    <div className="cookie-popup" role="dialog" aria-modal="true" aria-labelledby="cookie-title">
      <div className="cookie-popup-content">
        <img src="cookie.png" alt="" height="80" width="80" />
        <p id="cookie-title">We use cookies to enhance your experience.</p>
        <p>By continuing to visit this site, you agree to our use of cookies.</p>
        <button type="button" onClick={onAccept}>Accept</button>
      </div>
    </div>
  );
}
