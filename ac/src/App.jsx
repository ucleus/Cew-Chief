import { useCallback, useEffect, useState } from "react";
import Icon from "./components/ui/Icon";
import StintModal from "./components/stint/StintModal";
import Dashboard from "./screens/Dashboard";
import HistoryScreen from "./screens/HistoryScreen";
import LoginScreen from "./screens/LoginScreen";
import SettingsScreen from "./screens/SettingsScreen";
import GarageScreen from "./screens/GarageScreen";
import { DriversApi, StintsApi } from "./api/client";
import { C } from "./styles/theme";

export default function App() {
  const [screen, setScreen] = useState("login");
  const [activeTab, setActiveTab] = useState("dashboard");
  const [driver, setDriver] = useState(null);
  const [settings, setSettings] = useState(null);
  const [stints, setStints] = useState([]);
  const [showStintModal, setShowStintModal] = useState(false);

  useEffect(() => {
    try {
      const s = localStorage.getItem("ac_settings");
      if (s) setSettings(JSON.parse(s));
    } catch {}
  }, []);

  const refreshStints = useCallback(() => {
    if (!settings?.carId) {
      setStints([]);
      return;
    }
    StintsApi.listByCar(settings.carId)
      .then(setStints)
      .catch(() => setStints([]));
  }, [settings?.carId]);

  useEffect(() => {
    refreshStints();
  }, [refreshStints]);

  const handleLogin = async (driverData) => {
    setDriver(driverData);
    setScreen("app");
    try {
      const dbDriver = await DriversApi.findOrCreate(driverData.name);
      setDriver((d) => ({ ...d, driverId: dbDriver.id, styleNotes: dbDriver.style_notes }));
    } catch {
      // Driver profile editing just won't be available this session; local login still works.
    }
  };

  const handleSaveSettings = (s) => {
    setSettings(s);
    localStorage.setItem("ac_settings", JSON.stringify(s));
    setActiveTab("dashboard");
  };

  const handleSaveStint = async (payload) => {
    await StintsApi.create(payload);
    refreshStints();
  };

  const tabs = [
    { id: "dashboard", label: "Dashboard", icon: "dashboard" },
    { id: "garage", label: "Garage", icon: "wrench" },
    { id: "history", label: "History", icon: "chart" },
    { id: "settings", label: "Settings", icon: "settings" },
  ];

  if (screen === "login") return <LoginScreen onLogin={handleLogin} />;

  return (
    <div className="hud-app">
      <header className="hud-topbar">
        <div className="hud-topbar__inner">
          <div className="hud-brand">
            <Icon name="flag" size={20} color={C.orange} />
            AC CREW CHIEF
          </div>
          <div className="hud-topbar__meta">{driver?.name && <b>{driver.name}</b>}</div>
          <a href="/" className="hud-topbar__btn" title="Switch to the MotoGP app">
            <Icon name="motorcycle" size={18} color={C.cyan} />
            MotoGP App
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
        {activeTab === "dashboard" && (
          <Dashboard settings={settings} stints={stints} onAddStint={() => setShowStintModal(true)} />
        )}
        {activeTab === "garage" && <GarageScreen settings={settings} />}
        {activeTab === "history" && (
          <HistoryScreen settings={settings} stints={stints} onSetupApplied={refreshStints} />
        )}
        {activeTab === "settings" && (
          <SettingsScreen
            settings={settings}
            driver={driver}
            onSave={handleSaveSettings}
            onBack={() => setActiveTab("dashboard")}
          />
        )}
      </main>

      {showStintModal && (
        <StintModal settings={settings} onClose={() => setShowStintModal(false)} onSave={handleSaveStint} />
      )}
    </div>
  );
}
