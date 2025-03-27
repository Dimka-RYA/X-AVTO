import { BrowserRouter as Router } from 'react-router-dom';
import { Routes, Route } from 'react-router-dom';
import { Navigation } from './components/Navigation/Navigation';
import { TopBar } from './components/TopBar/TopBar';
import { Home } from './Tabs/HomeTab/Home';
import { Requests } from './Tabs/RequestsTab/Requests';
import { Ports } from './Tabs/PortsTab/Ports';
import { Scripts } from './Tabs/ScriptsTab/Scripts';
import { State } from './Tabs/StatusTab/Status';
import { Terminal } from './Tabs/TerminalTab/Terminal';
import './App.css';

function App() {
  return (
    <Router>
      <div className="app-container">
        <TopBar />
        <div className="main-content">
          <Navigation />
          <div className="content">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/requests" element={<Requests />} />
              <Route path="/ports" element={<Ports />} />
              <Route path="/scripts" element={<Scripts />} />
              <Route path="/state" element={<State />} />
              <Route path="/terminal" element={<Terminal />} />
            </Routes>
          </div>
        </div>
      </div>
    </Router>
  );
}

export default App;