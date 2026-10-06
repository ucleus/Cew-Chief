import { useCallback, useEffect, useState } from "react";
import Icon from "./components/ui/Icon";
import SessionModal from "./components/session/SessionModal";
import Dashboard from "./screens/Dashboard";
import HistoryScreen from "./screens/HistoryScreen";
import LoginScreen from "./screens/LoginScreen";
import SettingsScreen from "./screens/SettingsScreen";
import SetupScreen from "./screens/SetupScreen";
import { SessionsApi } from "./api/client";
import { C } from "./styles/theme";

export default function App() {
  const [screen, setScreen] = useState("login");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [rider, setRider] = useState(null);
  const [settings, setSettings] = useState(null);
  const [sessions, setSessions] = useState([]);
  const [showSessionModal, setShowSessionModal] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem("mgp_settings");
      if (s) setSettings(JSON.parse(s));
    } catch {}
  }, []);

  const refreshSessions = useCallback(() => {
    if (!settings?.bikeId) {
      setSessions([]);
      return;
    }
    SessionsApi.listByBike(settings.bikeId)
      .then(setSessions)
      .catch(() => setSessions([]));
  }, [settings?.bikeId]);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const handleLogin = (riderData) => {
    setRider(riderData);
    setScreen("app");
  };

  const handleSaveSettings = (s) => {
    const merged = { ...s, riderName: rider?.name };
    setSettings(merged);
    localStorage.setItem("mgp_settings", JSON.stringify(merged));
    setActiveTab("dashboard");
  };

  const handleSaveSession = async (payload) => {
    await SessionsApi.create(payload);
    refreshSessions();
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "setup", label: "Setup", icon: "wrench" },
    { id: "history", label: "History", icon: "chart" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  if (screen === "login") return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="hud-app">
      {/* Top strip */}
      <header className="hud-topbar">
        <div className="hud-topbar__inner">
          <div className="hud-brand">
            <Icon name="motorcycle" size={20} color={C.orange} />
            CREW CHIEF
          </div>
          <div className="hud-topbar__meta">
            {settings?.riderNumber && <b>#{settings.riderNumber}</b>}
            {settings?.class_ && <span>{settings.class_}</span>}
          </div>
          <button
            type="button"
            className="hud-topbar__btn"
            aria-current={activeTab === "settings" ? "page" : undefined}
            onClick={() => setActiveTab("settings")}
          >
            <Icon name="settings" size={18} color={C.orange} />
            Settings
          </button>
        </div>
      </header>

      {/* Tabs — bottom bar on phones, top strip on desktop */}
      <nav className="hud-nav" aria-label="Sections">
        {tabs.map((tab) => {
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              className="hud-nav__tab"
              aria-current={active ? "page" : undefined}
              onClick={() => setActiveTab(tab.id)}
            >
              <Icon name={tab.icon} size={18} color={active ? C.orange : C.ink3} />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>

      {/* Content */}
      <main className="hud-shell">
        {activeTab === "dashboard" && (
          <Dashboard
            settings={{ ...settings, riderName: rider?.name }}
            sessions={sessions}
            onAddSession={() => setShowSessionModal(true)}
          />
        )}
        {activeTab === "setup" && <SetupScreen settings={settings} />}
        {activeTab === "history" && (
          <HistoryScreen settings={settings} sessions={sessions} onSetupApplied={refreshSessions} />
        )}
        {activeTab === "settings" && (
          <SettingsScreen
            settings={settings}
            onSave={handleSaveSettings}
            onBack={() => setActiveTab("dashboard")}
          />
        )}
      </main>

      {showSessionModal && (
        <SessionModal
          settings={settings}
          onClose={() => setShowSessionModal(false)}
          onSave={handleSaveSession}
        />
      )}
    </div>
  );
}
