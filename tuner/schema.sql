-- =====================================================================
-- AC Race Engineer - schema v1
-- MySQL 8 / MariaDB 10.4+, InnoDB, utf8mb4
--
-- Shared hosting: create the database in your hosting panel first,
-- then import this file into it (no CREATE DATABASE / USE here).
--
-- Design rules
--   * A setup is immutable once a stint has been run on it. Changing
--     anything creates a new row with parent_setup_id pointing back,
--     so every lap time is tied to the exact values that produced it.
--   * Per-wheel values live in setup_corners / stint_tires (4 rows each),
--     which mirrors how AC stores them (_LF, _RF, _LR, _RR).
--   * A NULL setup value means "this car does not expose that setting".
--   * car_param_ranges is the source of truth for what a car allows.
--     Its param_key values match the column names in setups and
--     setup_corners exactly.
-- =====================================================================

SET NAMES utf8mb4;

-- ---------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS drivers (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(80)  NOT NULL,
    style_notes VARCHAR(255) NULL COMMENT 'e.g. late braker, prefers a loose rear',
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tracks (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    layout             VARCHAR(60)  NOT NULL DEFAULT 'Standard',
    ac_folder          VARCHAR(100) NULL COMMENT 'AC content folder name, used to match imported setup files',
    length_m           INT UNSIGNED NOT NULL,
    direction          ENUM('CW','CCW') NOT NULL DEFAULT 'CW',
    downforce_demand   ENUM('LOW','MEDIUM','HIGH','MAX') NOT NULL DEFAULT 'MEDIUM',
    bumpiness          TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 smooth - 5 very bumpy',
    kerb_usage         TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 avoid kerbs - 5 kerbs are the racing line',
    slow_corners       TINYINT UNSIGNED NULL COMMENT 'count, roughly under 100 km/h',
    medium_corners     TINYINT UNSIGNED NULL,
    fast_corners       TINYINT UNSIGNED NULL COMMENT 'count, roughly over 180 km/h',
    longest_straight_m INT UNSIGNED NULL,
    notes              TEXT NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_track_layout (name, layout)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS cars (
    id                 INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    name               VARCHAR(100) NOT NULL,
    ac_folder          VARCHAR(100) NULL COMMENT 'AC content folder name',
    car_class          VARCHAR(40)  NOT NULL,
    drivetrain         ENUM('FR','MR','RR','FF','AWD') NOT NULL DEFAULT 'MR',
    total_mass_kg      DECIMAL(6,1) NOT NULL COMMENT 'With driver, without fuel (car.ini TOTALMASS)',
    front_weight_pct   DECIMAL(4,1) NOT NULL COMMENT 'e.g. 45.0',
    wheelbase_mm       SMALLINT UNSIGNED NOT NULL,
    track_front_mm     SMALLINT UNSIGNED NOT NULL,
    track_rear_mm      SMALLINT UNSIGNED NOT NULL,
    unsprung_front_kg  DECIMAL(4,1) NOT NULL DEFAULT 45.0 COMMENT 'Per corner',
    unsprung_rear_kg   DECIMAL(4,1) NOT NULL DEFAULT 50.0 COMMENT 'Per corner',
    motion_ratio_front DECIMAL(4,3) NOT NULL DEFAULT 1.000 COMMENT 'Leave 1.000 when the game value is already a wheel rate (normal for AC)',
    motion_ratio_rear  DECIMAL(4,3) NOT NULL DEFAULT 1.000,
    fuel_tank_l        DECIMAL(5,1) NULL,
    notes              TEXT NULL,
    created_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_car_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Operating targets belong to the tyre, not the car: the same car wants
-- different pressures and temperatures on different compounds.
CREATE TABLE IF NOT EXISTS tire_compounds (
    id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    car_id               INT UNSIGNED NOT NULL,
    name                 VARCHAR(40)  NOT NULL COMMENT 'e.g. Slick Medium',
    target_hot_psi_front DECIMAL(4,1) NOT NULL,
    target_hot_psi_rear  DECIMAL(4,1) NOT NULL,
    temp_min_c           DECIMAL(4,1) NOT NULL COMMENT 'Bottom of the working window',
    temp_max_c           DECIMAL(4,1) NOT NULL COMMENT 'Top of the working window',
    UNIQUE KEY uq_compound (car_id, name),
    CONSTRAINT fk_compound_car FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- What each car lets you adjust, and how far. One row per parameter and
-- scope. A missing row means the parameter is not adjustable on that car,
-- so the form hides it and the AI is not allowed to recommend it.
--
-- real_base / real_per_unit convert a setup-screen value (often clicks)
-- into a physical one:  real = real_base + screen_value * real_per_unit
-- Leave both NULL when the screen already shows the physical value.
CREATE TABLE IF NOT EXISTS car_param_ranges (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    car_id        INT UNSIGNED NOT NULL,
    param_key     VARCHAR(40)  NOT NULL COMMENT 'Column name in setups or setup_corners',
    scope         ENUM('CAR','FRONT','REAR') NOT NULL DEFAULT 'CAR' COMMENT 'FRONT/REAR for per-wheel parameters',
    min_value     DECIMAL(10,3) NOT NULL,
    max_value     DECIMAL(10,3) NOT NULL,
    step_value    DECIMAL(10,3) NOT NULL DEFAULT 1.000,
    unit          VARCHAR(12)  NOT NULL COMMENT 'As shown in game: psi, deg, N/mm, clicks, %, mm, Nm, L',
    higher_means  VARCHAR(40)  NOT NULL COMMENT 'What a larger number does on this car: stiffer, more wing, more rear lock',
    real_base     DECIMAL(12,3) NULL,
    real_per_unit DECIMAL(12,3) NULL,
    real_unit     VARCHAR(12)  NULL COMMENT 'e.g. N/m, Ns/m',
    UNIQUE KEY uq_car_param (car_id, param_key, scope),
    CONSTRAINT fk_range_car FOREIGN KEY (car_id) REFERENCES cars(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Setups
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS setups (
    id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    car_id               INT UNSIGNED NOT NULL,
    track_id             INT UNSIGNED NOT NULL,
    parent_setup_id      INT UNSIGNED NULL COMMENT 'The setup this one was derived from',
    version              SMALLINT UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Position in the chain for this car and track',
    name                 VARCHAR(100) NOT NULL,
    purpose              ENUM('BASELINE','QUALI','RACE','ENDURANCE','WET') NOT NULL DEFAULT 'RACE',
    compound_id          INT UNSIGNED NOT NULL,
    change_summary       VARCHAR(255) NULL COMMENT 'What changed versus the parent, in plain words',

    -- Fuel and brakes
    fuel_l               DECIMAL(5,1) NOT NULL,
    brake_bias_front_pct DECIMAL(4,1) NULL,
    brake_power_pct      TINYINT UNSIGNED NULL,
    brake_duct_front     TINYINT UNSIGNED NULL,
    brake_duct_rear      TINYINT UNSIGNED NULL,

    -- Anti-roll bars (value as shown in game)
    arb_front            DECIMAL(9,2) NULL,
    arb_rear             DECIMAL(9,2) NULL,

    -- Alignment that is not per wheel
    caster_deg           DECIMAL(4,2) NULL,

    -- Aero
    wing_front           SMALLINT NULL,
    wing_rear            SMALLINT NULL,

    -- Differential and gearing
    diff_power_pct       TINYINT UNSIGNED NULL,
    diff_coast_pct       TINYINT UNSIGNED NULL,
    diff_preload_nm      SMALLINT UNSIGNED NULL,
    final_drive          DECIMAL(6,3) NULL,
    gear_ratios          JSON NULL COMMENT 'Array of ratios, 1st gear first',

    -- Electronics
    tc_level             TINYINT UNSIGNED NULL,
    abs_level            TINYINT UNSIGNED NULL,
    engine_brake         TINYINT UNSIGNED NULL,
    turbo_boost_pct      TINYINT UNSIGNED NULL,

    notes                TEXT NULL,
    created_at           TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY idx_setup_chain (car_id, track_id, version),
    CONSTRAINT fk_setup_car      FOREIGN KEY (car_id)          REFERENCES cars(id)           ON DELETE CASCADE,
    CONSTRAINT fk_setup_track    FOREIGN KEY (track_id)        REFERENCES tracks(id)         ON DELETE CASCADE,
    CONSTRAINT fk_setup_parent   FOREIGN KEY (parent_setup_id) REFERENCES setups(id)         ON DELETE SET NULL,
    CONSTRAINT fk_setup_compound FOREIGN KEY (compound_id)     REFERENCES tire_compounds(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Always four rows per setup. Values are stored as the game shows them;
-- car_param_ranges converts them to physical units where needed.
CREATE TABLE IF NOT EXISTS setup_corners (
    setup_id      INT UNSIGNED NOT NULL,
    corner        ENUM('FL','FR','RL','RR') NOT NULL,
    cold_psi      DECIMAL(4,1) NOT NULL,
    camber_deg    DECIMAL(4,2) NULL COMMENT 'Negative = top of the tyre leans in',
    toe           DECIMAL(7,3) NULL COMMENT 'In the unit the car shows',
    spring_rate   DECIMAL(8,2) NULL,
    ride_height   DECIMAL(6,1) NULL,
    packer        DECIMAL(5,1) NULL,
    bumpstop_rate DECIMAL(8,2) NULL,
    slow_bump     SMALLINT NULL,
    slow_rebound  SMALLINT NULL,
    fast_bump     SMALLINT NULL,
    fast_rebound  SMALLINT NULL,
    PRIMARY KEY (setup_id, corner),
    CONSTRAINT fk_corner_setup FOREIGN KEY (setup_id) REFERENCES setups(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Stints (one run on one setup)
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS stints (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    setup_id       INT UNSIGNED NOT NULL,
    driver_id      INT UNSIGNED NULL,
    session_type   ENUM('PRACTICE','QUALI','RACE') NOT NULL DEFAULT 'PRACTICE',
    run_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    lap_count      SMALLINT UNSIGNED NOT NULL,
    best_lap_ms    INT UNSIGNED NOT NULL,
    avg_lap_ms     INT UNSIGNED NULL COMMENT 'Valid flying laps only',
    lap_stdev_ms   INT UNSIGNED NULL COMMENT 'Consistency, valid flying laps only',

    -- Conditions. Lap times are only comparable when these match.
    ambient_temp_c DECIMAL(4,1) NOT NULL,
    track_temp_c   DECIMAL(4,1) NOT NULL,
    grip_pct       DECIMAL(4,1) NULL COMMENT 'Track grip shown in session, e.g. 98.0',
    fuel_start_l   DECIMAL(5,1) NULL,
    fuel_end_l     DECIMAL(5,1) NULL,
    top_speed_kmh  SMALLINT UNSIGNED NULL,

    driver_notes   TEXT NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

    KEY idx_stint_setup (setup_id, run_at),
    CONSTRAINT fk_stint_setup  FOREIGN KEY (setup_id)  REFERENCES setups(id)  ON DELETE CASCADE,
    CONSTRAINT fk_stint_driver FOREIGN KEY (driver_id) REFERENCES drivers(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS stint_laps (
    stint_id INT UNSIGNED NOT NULL,
    lap_no   SMALLINT UNSIGNED NOT NULL,
    lap_ms   INT UNSIGNED NOT NULL,
    is_valid TINYINT(1) NOT NULL DEFAULT 1 COMMENT '0 for out-laps, in-laps, cuts and spins',
    PRIMARY KEY (stint_id, lap_no),
    CONSTRAINT fk_lap_stint FOREIGN KEY (stint_id) REFERENCES stints(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Hot readings, four rows per stint.
CREATE TABLE IF NOT EXISTS stint_tires (
    stint_id   INT UNSIGNED NOT NULL,
    corner     ENUM('FL','FR','RL','RR') NOT NULL,
    hot_psi    DECIMAL(4,1) NOT NULL,
    temp_in_c  DECIMAL(4,1) NOT NULL,
    temp_mid_c DECIMAL(4,1) NOT NULL,
    temp_out_c DECIMAL(4,1) NOT NULL,
    wear_pct   DECIMAL(4,1) NULL,
    PRIMARY KEY (stint_id, corner),
    CONSTRAINT fk_tire_stint FOREIGN KEY (stint_id) REFERENCES stints(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- One row per complaint. Speed range is what lets the engineer separate
-- mechanical problems (slow corners) from aero problems (fast corners).
CREATE TABLE IF NOT EXISTS stint_feedback (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    stint_id    INT UNSIGNED NOT NULL,
    phase       ENUM('BRAKING','ENTRY','MID','EXIT','STRAIGHT','KERBS') NOT NULL,
    speed_range ENUM('LOW','MEDIUM','HIGH','ALL') NOT NULL DEFAULT 'ALL',
    symptom     ENUM('UNDERSTEER','OVERSTEER','SNAP_OVERSTEER','TRACTION_LOSS',
                     'FRONT_LOCKING','REAR_LOCKING','INSTABILITY','BOTTOMING',
                     'BOUNCING','SLOW_RESPONSE','OTHER') NOT NULL,
    severity    TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 minor - 5 undriveable',
    corner_ref  VARCHAR(40)  NULL COMMENT 'e.g. T1, final chicane',
    note        VARCHAR(255) NULL,
    KEY idx_feedback_stint (stint_id),
    CONSTRAINT fk_feedback_stint FOREIGN KEY (stint_id) REFERENCES stints(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- AI recommendations
-- ---------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS recommendations (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    stint_id          INT UNSIGNED NOT NULL,
    provider          ENUM('anthropic','openai','gemini') NOT NULL,
    model             VARCHAR(80) NOT NULL COMMENT 'Model id from config at request time',
    prompt_version    VARCHAR(20) NOT NULL,
    request_json      JSON NOT NULL COMMENT 'Exact payload sent, for replay and debugging',
    response_json     JSON NOT NULL COMMENT 'Exact response received, after validation',
    diagnosis         TEXT NOT NULL,
    confidence        ENUM('LOW','MEDIUM','HIGH') NOT NULL,
    expected_tradeoff TEXT NOT NULL,
    status            ENUM('PENDING','APPLIED','PARTIAL','REJECTED') NOT NULL DEFAULT 'PENDING',
    applied_setup_id  INT UNSIGNED NULL COMMENT 'The setup created from this advice',
    input_tokens      INT UNSIGNED NULL,
    output_tokens     INT UNSIGNED NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_rec_stint (stint_id),
    CONSTRAINT fk_rec_stint   FOREIGN KEY (stint_id)         REFERENCES stints(id) ON DELETE CASCADE,
    CONSTRAINT fk_rec_applied FOREIGN KEY (applied_setup_id) REFERENCES setups(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recommendation_items (
    id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    recommendation_id INT UNSIGNED NOT NULL,
    priority          TINYINT UNSIGNED NOT NULL COMMENT '1 = primary change',
    source            ENUM('MATH','AI') NOT NULL COMMENT 'MATH = copied from the calculator',
    param_key         VARCHAR(40) NOT NULL,
    scope             ENUM('FL','FR','RL','RR','FRONT','REAR','CAR') NOT NULL,
    current_value     DECIMAL(10,3) NOT NULL,
    suggested_value   DECIMAL(10,3) NOT NULL,
    unit              VARCHAR(12) NOT NULL,
    addresses         VARCHAR(255) NULL COMMENT 'Which complaint or reading this targets',
    rationale         TEXT NOT NULL,
    tradeoff          TEXT NULL,
    accepted          TINYINT(1) NULL COMMENT 'NULL undecided, 1 applied, 0 skipped',
    KEY idx_item_rec (recommendation_id, priority),
    CONSTRAINT fk_item_rec FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------
-- Chart helper: one row per setup version with its results.
-- Feeds the "lap time by setup version" line chart.
-- ---------------------------------------------------------------------

CREATE OR REPLACE VIEW v_setup_progress AS
SELECT
    s.id                       AS setup_id,
    s.car_id,
    s.track_id,
    s.version,
    s.name,
    s.change_summary,
    COUNT(st.id)               AS stint_count,
    MIN(st.best_lap_ms)        AS best_lap_ms,
    ROUND(AVG(st.avg_lap_ms))  AS mean_avg_lap_ms,
    ROUND(AVG(st.track_temp_c), 1) AS mean_track_temp_c
FROM setups s
LEFT JOIN stints st ON st.setup_id = s.id
GROUP BY s.id, s.car_id, s.track_id, s.version, s.name, s.change_summary;
