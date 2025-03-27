

export const Requests = () => {
  return (
    <div className="requests-container">
      <h2>История запросов</h2>
      <div className="requests-list">
        <div className="request-item">
          <span className="timestamp">2023-10-01 14:30:00</span>
          <span className="method GET">GET</span>
          <span className="url">/api/status</span>
          <span className="status success">200 OK</span>
        </div>
        <div className="request-item">
          <span className="timestamp">2023-10-01 14:31:15</span>
          <span className="method POST">POST</span>
          <span className="url">/api/configure</span>
          <span className="status warning">202 Accepted</span>
        </div>
      </div>
    </div>
  );
};