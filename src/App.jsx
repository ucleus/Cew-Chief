import { useEffect, useState } from "react";
import Icon from "./components/ui/Icon";
import LoginScreen from "./screens/LoginScreen";
import SettingsScreen from "./screens/SettingsScreen";
import TuneScreen from "./screens/TuneScreen";
import { C } from "./styles/theme";

export default function App() {
  const [screen, setScreen] = useState("login");
  const [activeTab, setActiveTab] = useState("tune");
  const [rider, setRider] = useState(null);
  const [settings, setSettings] = useState(null);

  useEffect(() => {
    try {
      const s = localStorage.getItem("mgp_settings");
      if (s) setSettings(JSON.parse(s));
    } catch {}
  }, []);

  const handleLogin = (riderData) => {
    setRider(riderData);
    setScreen("app");
  };

  const handleSaveSettings = (s) => {
    const merged = { ...s, riderName: rider?.name };
    setSettings(merged);
    localStorage.setItem("mgp_settings", JSON.stringify(merged));
    setActiveTab("tune");
  };

  const tabs = [
    { id: "tune", label: "Tune", icon: "wrench" },
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
            <span>MotoGP 26</span>
          </div>
          <a href="/ac/" className="hud-topbar__btn" title="Switch to the Assetto Corsa app">
            <Icon name="flag" size={18} color={C.cyan} />
            AC App
          </a>
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

      <main className="hud-shell">
        {activeTab === "tune" && <TuneScreen settings={settings} />}
        {activeTab === "settings" && (
          <SettingsScreen settings={settings} onSave={handleSaveSettings} onBack={() => setActiveTab("tune")} />
        )}
      </main>
    </div>
  );
}
