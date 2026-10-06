-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- Host: 127.0.0.1:3306
-- Generation Time: Oct 06, 2026 at 04:32 PM
-- Server version: 11.8.9-MariaDB-log
-- PHP Version: 7.2.34

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";


/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

--
-- Database: `u652263477_uzi544086`
--

-- --------------------------------------------------------

--
-- Table structure for table `cars`
--

CREATE TABLE `cars` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL,
  `ac_folder` varchar(100) DEFAULT NULL COMMENT 'AC content folder name',
  `car_class` varchar(40) NOT NULL,
  `drivetrain` enum('FR','MR','RR','FF','AWD') NOT NULL DEFAULT 'MR',
  `total_mass_kg` decimal(6,1) NOT NULL COMMENT 'With driver, without fuel (car.ini TOTALMASS)',
  `front_weight_pct` decimal(4,1) NOT NULL COMMENT 'e.g. 45.0',
  `wheelbase_mm` smallint(5) UNSIGNED NOT NULL,
  `track_front_mm` smallint(5) UNSIGNED NOT NULL,
  `track_rear_mm` smallint(5) UNSIGNED NOT NULL,
  `unsprung_front_kg` decimal(4,1) NOT NULL DEFAULT 45.0 COMMENT 'Per corner',
  `unsprung_rear_kg` decimal(4,1) NOT NULL DEFAULT 50.0 COMMENT 'Per corner',
  `motion_ratio_front` decimal(4,3) NOT NULL DEFAULT 1.000 COMMENT 'Leave 1.000 when the game value is already a wheel rate (normal for AC)',
  `motion_ratio_rear` decimal(4,3) NOT NULL DEFAULT 1.000,
  `fuel_tank_l` decimal(5,1) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `car_param_ranges`
--

CREATE TABLE `car_param_ranges` (
  `id` int(10) UNSIGNED NOT NULL,
  `car_id` int(10) UNSIGNED NOT NULL,
  `param_key` varchar(40) NOT NULL COMMENT 'Column name in setups or setup_corners',
  `scope` enum('CAR','FRONT','REAR') NOT NULL DEFAULT 'CAR' COMMENT 'FRONT/REAR for per-wheel parameters',
  `min_value` decimal(10,3) NOT NULL,
  `max_value` decimal(10,3) NOT NULL,
  `step_value` decimal(10,3) NOT NULL DEFAULT 1.000,
  `unit` varchar(12) NOT NULL COMMENT 'As shown in game: psi, deg, N/mm, clicks, %, mm, Nm, L',
  `higher_means` varchar(40) NOT NULL COMMENT 'What a larger number does on this car: stiffer, more wing, more rear lock',
  `real_base` decimal(12,3) DEFAULT NULL,
  `real_per_unit` decimal(12,3) DEFAULT NULL,
  `real_unit` varchar(12) DEFAULT NULL COMMENT 'e.g. N/m, Ns/m'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `drivers`
--

CREATE TABLE `drivers` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(80) NOT NULL,
  `style_notes` varchar(255) DEFAULT NULL COMMENT 'e.g. late braker, prefers a loose rear',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_bikes`
--

CREATE TABLE `mg_bikes` (
  `id` int(10) UNSIGNED NOT NULL,
  `game` enum('MotoGP 24','MotoGP 25','MotoGP 26') NOT NULL,
  `class` varchar(30) NOT NULL COMMENT 'MotoGP, Moto2, Moto3, MotoE, ...',
  `name` varchar(100) NOT NULL,
  `ranges_verified` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'The person checked the slider ranges against the garage',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_bike_options`
--

CREATE TABLE `mg_bike_options` (
  `id` int(10) UNSIGNED NOT NULL,
  `bike_id` int(10) UNSIGNED NOT NULL,
  `param_key` varchar(30) NOT NULL COMMENT 'front_disc, rear_disc, tyre_front, tyre_rear',
  `label` varchar(60) NOT NULL COMMENT 'As the garage names it, e.g. 340 mm high mass',
  `size_mm` smallint(6) DEFAULT NULL COMMENT 'Discs only',
  `kind` varchar(20) DEFAULT NULL COMMENT 'Discs: STANDARD, HIGH_MASS, EXTREME_COOLING. Tyres: SOFT, MEDIUM, HARD, WET',
  `rank_no` tinyint(3) UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Tyres: softest first. Discs: smallest first'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_bike_params`
--

CREATE TABLE `mg_bike_params` (
  `bike_id` int(10) UNSIGNED NOT NULL,
  `param_key` varchar(30) NOT NULL,
  `min_value` smallint(6) NOT NULL,
  `max_value` smallint(6) NOT NULL,
  `default_value` smallint(6) NOT NULL COMMENT 'What the garage shows before any change',
  `step_value` smallint(6) NOT NULL DEFAULT 1,
  `flip` tinyint(1) NOT NULL DEFAULT 0 COMMENT '1 when a higher number does the opposite of the usual meaning on this bike'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_recommendations`
--

CREATE TABLE `mg_recommendations` (
  `id` int(10) UNSIGNED NOT NULL,
  `session_id` int(10) UNSIGNED NOT NULL,
  `source` enum('MODEL','AI') NOT NULL,
  `provider` varchar(20) DEFAULT NULL,
  `model` varchar(80) DEFAULT NULL,
  `prompt_version` varchar(20) NOT NULL,
  `request_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL CHECK (json_valid(`request_json`)),
  `response_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL CHECK (json_valid(`response_json`)),
  `diagnosis` text NOT NULL,
  `confidence` enum('LOW','MEDIUM','HIGH') NOT NULL,
  `expected_tradeoff` text NOT NULL,
  `status` enum('PENDING','APPLIED','PARTIAL','REJECTED') NOT NULL DEFAULT 'PENDING',
  `applied_setup_id` int(10) UNSIGNED DEFAULT NULL,
  `input_tokens` int(10) UNSIGNED DEFAULT NULL,
  `output_tokens` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_rec_items`
--

CREATE TABLE `mg_rec_items` (
  `id` int(10) UNSIGNED NOT NULL,
  `recommendation_id` int(10) UNSIGNED NOT NULL,
  `priority` tinyint(3) UNSIGNED NOT NULL,
  `source` enum('MODEL','AI') NOT NULL,
  `param_key` varchar(30) NOT NULL,
  `kind` enum('NUM','CHOICE') NOT NULL,
  `current_text` varchar(60) NOT NULL,
  `suggested_text` varchar(60) NOT NULL,
  `suggested_number` smallint(6) DEFAULT NULL,
  `suggested_option_id` int(10) UNSIGNED DEFAULT NULL,
  `addresses` varchar(255) DEFAULT NULL,
  `rationale` text NOT NULL,
  `tradeoff` text DEFAULT NULL,
  `accepted` tinyint(1) DEFAULT NULL COMMENT 'NULL undecided, 1 applied, 0 skipped'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_sessions`
--

CREATE TABLE `mg_sessions` (
  `id` int(10) UNSIGNED NOT NULL,
  `setup_id` int(10) UNSIGNED NOT NULL,
  `session_type` enum('PRACTICE','QUALI','SPRINT','RACE') NOT NULL DEFAULT 'PRACTICE',
  `run_at` datetime NOT NULL DEFAULT current_timestamp(),
  `lap_count` smallint(5) UNSIGNED NOT NULL,
  `best_lap_ms` int(10) UNSIGNED NOT NULL,
  `avg_lap_ms` int(10) UNSIGNED DEFAULT NULL,
  `lap_stdev_ms` int(10) UNSIGNED DEFAULT NULL,
  `ambient_temp_c` decimal(4,1) DEFAULT NULL,
  `track_temp_c` decimal(4,1) DEFAULT NULL,
  `weather` enum('DRY','DAMP','WET') NOT NULL DEFAULT 'DRY',
  `race_laps` smallint(5) UNSIGNED DEFAULT NULL COMMENT 'Planned race distance, used to project tyre wear',
  `tyre_front_temp` enum('COLD','OK','HOT') DEFAULT NULL COMMENT 'As the HUD shows it after a few laps',
  `tyre_rear_temp` enum('COLD','OK','HOT') DEFAULT NULL,
  `tyre_front_wear_pct` decimal(4,1) DEFAULT NULL COMMENT 'Percent worn at the end of the run',
  `tyre_rear_wear_pct` decimal(4,1) DEFAULT NULL,
  `brake_front_temp` enum('COLD','OK','HOT') DEFAULT NULL,
  `brake_rear_temp` enum('COLD','OK','HOT') DEFAULT NULL,
  `hit_limiter` tinyint(1) NOT NULL DEFAULT 0 COMMENT 'Reached the rev limiter on a straight',
  `driver_notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_session_feedback`
--

CREATE TABLE `mg_session_feedback` (
  `id` int(10) UNSIGNED NOT NULL,
  `session_id` int(10) UNSIGNED NOT NULL,
  `phase` enum('BRAKING','ENTRY','MID','EXIT','STRAIGHT','BUMPS') NOT NULL,
  `corner_type` enum('ALL','SLOW','MEDIUM','FAST') NOT NULL DEFAULT 'ALL',
  `symptom` varchar(30) NOT NULL,
  `severity` tinyint(3) UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 minor, 5 undriveable',
  `corner_ref` varchar(40) DEFAULT NULL,
  `note` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_session_laps`
--

CREATE TABLE `mg_session_laps` (
  `session_id` int(10) UNSIGNED NOT NULL,
  `lap_no` smallint(5) UNSIGNED NOT NULL,
  `lap_ms` int(10) UNSIGNED NOT NULL,
  `is_valid` tinyint(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_setups`
--

CREATE TABLE `mg_setups` (
  `id` int(10) UNSIGNED NOT NULL,
  `bike_id` int(10) UNSIGNED NOT NULL,
  `track_id` int(10) UNSIGNED NOT NULL,
  `parent_setup_id` int(10) UNSIGNED DEFAULT NULL,
  `version` smallint(5) UNSIGNED NOT NULL DEFAULT 1,
  `name` varchar(100) NOT NULL,
  `purpose` enum('PRACTICE','QUALI','SPRINT','RACE','WET') NOT NULL DEFAULT 'RACE',
  `change_summary` varchar(255) DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_setup_choices`
--

CREATE TABLE `mg_setup_choices` (
  `setup_id` int(10) UNSIGNED NOT NULL,
  `param_key` varchar(30) NOT NULL,
  `option_id` int(10) UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_setup_values`
--

CREATE TABLE `mg_setup_values` (
  `setup_id` int(10) UNSIGNED NOT NULL,
  `param_key` varchar(30) NOT NULL,
  `value` smallint(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `mg_tracks`
--

CREATE TABLE `mg_tracks` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL,
  `country` varchar(40) DEFAULT NULL,
  `length_m` int(10) UNSIGNED DEFAULT NULL,
  `slow_corners` tinyint(3) UNSIGNED DEFAULT NULL,
  `medium_corners` tinyint(3) UNSIGNED DEFAULT NULL,
  `fast_corners` tinyint(3) UNSIGNED DEFAULT NULL,
  `big_braking_zones` tinyint(3) UNSIGNED DEFAULT NULL COMMENT 'Hard stops from high speed',
  `quick_braking_zones` tinyint(3) UNSIGNED DEFAULT NULL COMMENT 'Braking zones that follow each other with little time to cool',
  `straight_rating` tinyint(3) UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 no long straights, 5 very long straights',
  `avg_speed_rating` tinyint(3) UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 tight and slow, 5 fast and flowing',
  `bumpiness` tinyint(3) UNSIGNED NOT NULL DEFAULT 3,
  `front_wear_rating` tinyint(3) UNSIGNED NOT NULL DEFAULT 3 COMMENT 'How hard the track is on the front tyre',
  `rear_wear_rating` tinyint(3) UNSIGNED NOT NULL DEFAULT 3 COMMENT 'How hard the track is on the rear tyre',
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `recommendations`
--

CREATE TABLE `recommendations` (
  `id` int(10) UNSIGNED NOT NULL,
  `stint_id` int(10) UNSIGNED NOT NULL,
  `provider` enum('anthropic','openai','gemini') NOT NULL,
  `model` varchar(80) NOT NULL COMMENT 'Model id from config at request time',
  `prompt_version` varchar(20) NOT NULL,
  `request_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Exact payload sent, for replay and debugging' CHECK (json_valid(`request_json`)),
  `response_json` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL COMMENT 'Exact response received, after validation' CHECK (json_valid(`response_json`)),
  `diagnosis` text NOT NULL,
  `confidence` enum('LOW','MEDIUM','HIGH') NOT NULL,
  `expected_tradeoff` text NOT NULL,
  `status` enum('PENDING','APPLIED','PARTIAL','REJECTED') NOT NULL DEFAULT 'PENDING',
  `applied_setup_id` int(10) UNSIGNED DEFAULT NULL COMMENT 'The setup created from this advice',
  `input_tokens` int(10) UNSIGNED DEFAULT NULL,
  `output_tokens` int(10) UNSIGNED DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `recommendation_items`
--

CREATE TABLE `recommendation_items` (
  `id` int(10) UNSIGNED NOT NULL,
  `recommendation_id` int(10) UNSIGNED NOT NULL,
  `priority` tinyint(3) UNSIGNED NOT NULL COMMENT '1 = primary change',
  `source` enum('MATH','AI') NOT NULL COMMENT 'MATH = copied from the calculator',
  `param_key` varchar(40) NOT NULL,
  `scope` enum('FL','FR','RL','RR','FRONT','REAR','CAR') NOT NULL,
  `current_value` decimal(10,3) NOT NULL,
  `suggested_value` decimal(10,3) NOT NULL,
  `unit` varchar(12) NOT NULL,
  `addresses` varchar(255) DEFAULT NULL COMMENT 'Which complaint or reading this targets',
  `rationale` text NOT NULL,
  `tradeoff` text DEFAULT NULL,
  `accepted` tinyint(1) DEFAULT NULL COMMENT 'NULL undecided, 1 applied, 0 skipped'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `setups`
--

CREATE TABLE `setups` (
  `id` int(10) UNSIGNED NOT NULL,
  `car_id` int(10) UNSIGNED NOT NULL,
  `track_id` int(10) UNSIGNED NOT NULL,
  `parent_setup_id` int(10) UNSIGNED DEFAULT NULL COMMENT 'The setup this one was derived from',
  `version` smallint(5) UNSIGNED NOT NULL DEFAULT 1 COMMENT 'Position in the chain for this car and track',
  `name` varchar(100) NOT NULL,
  `purpose` enum('BASELINE','QUALI','RACE','ENDURANCE','WET') NOT NULL DEFAULT 'RACE',
  `compound_id` int(10) UNSIGNED NOT NULL,
  `change_summary` varchar(255) DEFAULT NULL COMMENT 'What changed versus the parent, in plain words',
  `fuel_l` decimal(5,1) NOT NULL,
  `brake_bias_front_pct` decimal(4,1) DEFAULT NULL,
  `brake_power_pct` tinyint(3) UNSIGNED DEFAULT NULL,
  `brake_duct_front` tinyint(3) UNSIGNED DEFAULT NULL,
  `brake_duct_rear` tinyint(3) UNSIGNED DEFAULT NULL,
  `arb_front` decimal(9,2) DEFAULT NULL,
  `arb_rear` decimal(9,2) DEFAULT NULL,
  `caster_deg` decimal(4,2) DEFAULT NULL,
  `wing_front` smallint(6) DEFAULT NULL,
  `wing_rear` smallint(6) DEFAULT NULL,
  `diff_power_pct` tinyint(3) UNSIGNED DEFAULT NULL,
  `diff_coast_pct` tinyint(3) UNSIGNED DEFAULT NULL,
  `diff_preload_nm` smallint(5) UNSIGNED DEFAULT NULL,
  `final_drive` decimal(6,3) DEFAULT NULL,
  `gear_ratios` longtext CHARACTER SET utf8mb4 COLLATE utf8mb4_bin DEFAULT NULL COMMENT 'Array of ratios, 1st gear first' CHECK (json_valid(`gear_ratios`)),
  `tc_level` tinyint(3) UNSIGNED DEFAULT NULL,
  `abs_level` tinyint(3) UNSIGNED DEFAULT NULL,
  `engine_brake` tinyint(3) UNSIGNED DEFAULT NULL,
  `turbo_boost_pct` tinyint(3) UNSIGNED DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `setup_corners`
--

CREATE TABLE `setup_corners` (
  `setup_id` int(10) UNSIGNED NOT NULL,
  `corner` enum('FL','FR','RL','RR') NOT NULL,
  `cold_psi` decimal(4,1) NOT NULL,
  `camber_deg` decimal(4,2) DEFAULT NULL COMMENT 'Negative = top of the tyre leans in',
  `toe` decimal(7,3) DEFAULT NULL COMMENT 'In the unit the car shows',
  `spring_rate` decimal(8,2) DEFAULT NULL,
  `ride_height` decimal(6,1) DEFAULT NULL,
  `packer` decimal(5,1) DEFAULT NULL,
  `bumpstop_rate` decimal(8,2) DEFAULT NULL,
  `slow_bump` smallint(6) DEFAULT NULL,
  `slow_rebound` smallint(6) DEFAULT NULL,
  `fast_bump` smallint(6) DEFAULT NULL,
  `fast_rebound` smallint(6) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stints`
--

CREATE TABLE `stints` (
  `id` int(10) UNSIGNED NOT NULL,
  `setup_id` int(10) UNSIGNED NOT NULL,
  `driver_id` int(10) UNSIGNED DEFAULT NULL,
  `session_type` enum('PRACTICE','QUALI','RACE') NOT NULL DEFAULT 'PRACTICE',
  `run_at` datetime NOT NULL DEFAULT current_timestamp(),
  `lap_count` smallint(5) UNSIGNED NOT NULL,
  `best_lap_ms` int(10) UNSIGNED NOT NULL,
  `avg_lap_ms` int(10) UNSIGNED DEFAULT NULL COMMENT 'Valid flying laps only',
  `lap_stdev_ms` int(10) UNSIGNED DEFAULT NULL COMMENT 'Consistency, valid flying laps only',
  `ambient_temp_c` decimal(4,1) NOT NULL,
  `track_temp_c` decimal(4,1) NOT NULL,
  `grip_pct` decimal(4,1) DEFAULT NULL COMMENT 'Track grip shown in session, e.g. 98.0',
  `fuel_start_l` decimal(5,1) DEFAULT NULL,
  `fuel_end_l` decimal(5,1) DEFAULT NULL,
  `top_speed_kmh` smallint(5) UNSIGNED DEFAULT NULL,
  `driver_notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stint_feedback`
--

CREATE TABLE `stint_feedback` (
  `id` int(10) UNSIGNED NOT NULL,
  `stint_id` int(10) UNSIGNED NOT NULL,
  `phase` enum('BRAKING','ENTRY','MID','EXIT','STRAIGHT','KERBS') NOT NULL,
  `speed_range` enum('LOW','MEDIUM','HIGH','ALL') NOT NULL DEFAULT 'ALL',
  `symptom` enum('UNDERSTEER','OVERSTEER','SNAP_OVERSTEER','TRACTION_LOSS','FRONT_LOCKING','REAR_LOCKING','INSTABILITY','BOTTOMING','BOUNCING','SLOW_RESPONSE','OTHER') NOT NULL,
  `severity` tinyint(3) UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 minor - 5 undriveable',
  `corner_ref` varchar(40) DEFAULT NULL COMMENT 'e.g. T1, final chicane',
  `note` varchar(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stint_laps`
--

CREATE TABLE `stint_laps` (
  `stint_id` int(10) UNSIGNED NOT NULL,
  `lap_no` smallint(5) UNSIGNED NOT NULL,
  `lap_ms` int(10) UNSIGNED NOT NULL,
  `is_valid` tinyint(1) NOT NULL DEFAULT 1 COMMENT '0 for out-laps, in-laps, cuts and spins'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `stint_tires`
--

CREATE TABLE `stint_tires` (
  `stint_id` int(10) UNSIGNED NOT NULL,
  `corner` enum('FL','FR','RL','RR') NOT NULL,
  `hot_psi` decimal(4,1) NOT NULL,
  `temp_in_c` decimal(4,1) NOT NULL,
  `temp_mid_c` decimal(4,1) NOT NULL,
  `temp_out_c` decimal(4,1) NOT NULL,
  `wear_pct` decimal(4,1) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tire_compounds`
--

CREATE TABLE `tire_compounds` (
  `id` int(10) UNSIGNED NOT NULL,
  `car_id` int(10) UNSIGNED NOT NULL,
  `name` varchar(40) NOT NULL COMMENT 'e.g. Slick Medium',
  `target_hot_psi_front` decimal(4,1) NOT NULL,
  `target_hot_psi_rear` decimal(4,1) NOT NULL,
  `temp_min_c` decimal(4,1) NOT NULL COMMENT 'Bottom of the working window',
  `temp_max_c` decimal(4,1) NOT NULL COMMENT 'Top of the working window'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Table structure for table `tracks`
--

CREATE TABLE `tracks` (
  `id` int(10) UNSIGNED NOT NULL,
  `name` varchar(100) NOT NULL,
  `layout` varchar(60) NOT NULL DEFAULT 'Standard',
  `ac_folder` varchar(100) DEFAULT NULL COMMENT 'AC content folder name, used to match imported setup files',
  `length_m` int(10) UNSIGNED NOT NULL,
  `direction` enum('CW','CCW') NOT NULL DEFAULT 'CW',
  `downforce_demand` enum('LOW','MEDIUM','HIGH','MAX') NOT NULL DEFAULT 'MEDIUM',
  `bumpiness` tinyint(3) UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 smooth - 5 very bumpy',
  `kerb_usage` tinyint(3) UNSIGNED NOT NULL DEFAULT 3 COMMENT '1 avoid kerbs - 5 kerbs are the racing line',
  `slow_corners` tinyint(3) UNSIGNED DEFAULT NULL COMMENT 'count, roughly under 100 km/h',
  `medium_corners` tinyint(3) UNSIGNED DEFAULT NULL,
  `fast_corners` tinyint(3) UNSIGNED DEFAULT NULL COMMENT 'count, roughly over 180 km/h',
  `longest_straight_m` int(10) UNSIGNED DEFAULT NULL,
  `notes` text DEFAULT NULL,
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- --------------------------------------------------------

--
-- Stand-in structure for view `v_mg_setup_progress`
-- (See below for the actual view)
--
CREATE TABLE `v_mg_setup_progress` (
`setup_id` int(10) unsigned
,`bike_id` int(10) unsigned
,`track_id` int(10) unsigned
,`version` smallint(5) unsigned
,`name` varchar(100)
,`change_summary` varchar(255)
,`session_count` bigint(21)
,`best_lap_ms` int(10) unsigned
,`mean_avg_lap_ms` decimal(11,0)
,`mean_track_temp_c` decimal(5,1)
);

-- --------------------------------------------------------

--
-- Stand-in structure for view `v_setup_progress`
-- (See below for the actual view)
--
CREATE TABLE `v_setup_progress` (
`setup_id` int(10) unsigned
,`car_id` int(10) unsigned
,`track_id` int(10) unsigned
,`version` smallint(5) unsigned
,`name` varchar(100)
,`change_summary` varchar(255)
,`stint_count` bigint(21)
,`best_lap_ms` int(10) unsigned
,`mean_avg_lap_ms` decimal(11,0)
,`mean_track_temp_c` decimal(5,1)
);

--
-- Indexes for dumped tables
--

--
-- Indexes for table `cars`
--
ALTER TABLE `cars`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_car_name` (`name`);

--
-- Indexes for table `car_param_ranges`
--
ALTER TABLE `car_param_ranges`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_car_param` (`car_id`,`param_key`,`scope`);

--
-- Indexes for table `drivers`
--
ALTER TABLE `drivers`
  ADD PRIMARY KEY (`id`);

--
-- Indexes for table `mg_bikes`
--
ALTER TABLE `mg_bikes`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_mg_bike` (`game`,`class`,`name`);

--
-- Indexes for table `mg_bike_options`
--
ALTER TABLE `mg_bike_options`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_mg_option` (`bike_id`,`param_key`,`label`);

--
-- Indexes for table `mg_bike_params`
--
ALTER TABLE `mg_bike_params`
  ADD PRIMARY KEY (`bike_id`,`param_key`);

--
-- Indexes for table `mg_recommendations`
--
ALTER TABLE `mg_recommendations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mg_rec_session` (`session_id`),
  ADD KEY `fk_mg_rec_applied` (`applied_setup_id`);

--
-- Indexes for table `mg_rec_items`
--
ALTER TABLE `mg_rec_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mg_item_rec` (`recommendation_id`,`priority`);

--
-- Indexes for table `mg_sessions`
--
ALTER TABLE `mg_sessions`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mg_session_setup` (`setup_id`,`run_at`);

--
-- Indexes for table `mg_session_feedback`
--
ALTER TABLE `mg_session_feedback`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mg_feedback_session` (`session_id`);

--
-- Indexes for table `mg_session_laps`
--
ALTER TABLE `mg_session_laps`
  ADD PRIMARY KEY (`session_id`,`lap_no`);

--
-- Indexes for table `mg_setups`
--
ALTER TABLE `mg_setups`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_mg_setup_chain` (`bike_id`,`track_id`,`version`),
  ADD KEY `fk_mg_setup_track` (`track_id`),
  ADD KEY `fk_mg_setup_parent` (`parent_setup_id`);

--
-- Indexes for table `mg_setup_choices`
--
ALTER TABLE `mg_setup_choices`
  ADD PRIMARY KEY (`setup_id`,`param_key`),
  ADD KEY `fk_mg_choice_option` (`option_id`);

--
-- Indexes for table `mg_setup_values`
--
ALTER TABLE `mg_setup_values`
  ADD PRIMARY KEY (`setup_id`,`param_key`);

--
-- Indexes for table `mg_tracks`
--
ALTER TABLE `mg_tracks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_mg_track` (`name`);

--
-- Indexes for table `recommendations`
--
ALTER TABLE `recommendations`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_rec_stint` (`stint_id`),
  ADD KEY `fk_rec_applied` (`applied_setup_id`);

--
-- Indexes for table `recommendation_items`
--
ALTER TABLE `recommendation_items`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_item_rec` (`recommendation_id`,`priority`);

--
-- Indexes for table `setups`
--
ALTER TABLE `setups`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_setup_chain` (`car_id`,`track_id`,`version`),
  ADD KEY `fk_setup_track` (`track_id`),
  ADD KEY `fk_setup_parent` (`parent_setup_id`),
  ADD KEY `fk_setup_compound` (`compound_id`);

--
-- Indexes for table `setup_corners`
--
ALTER TABLE `setup_corners`
  ADD PRIMARY KEY (`setup_id`,`corner`);

--
-- Indexes for table `stints`
--
ALTER TABLE `stints`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_stint_setup` (`setup_id`,`run_at`),
  ADD KEY `fk_stint_driver` (`driver_id`);

--
-- Indexes for table `stint_feedback`
--
ALTER TABLE `stint_feedback`
  ADD PRIMARY KEY (`id`),
  ADD KEY `idx_feedback_stint` (`stint_id`);

--
-- Indexes for table `stint_laps`
--
ALTER TABLE `stint_laps`
  ADD PRIMARY KEY (`stint_id`,`lap_no`);

--
-- Indexes for table `stint_tires`
--
ALTER TABLE `stint_tires`
  ADD PRIMARY KEY (`stint_id`,`corner`);

--
-- Indexes for table `tire_compounds`
--
ALTER TABLE `tire_compounds`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_compound` (`car_id`,`name`);

--
-- Indexes for table `tracks`
--
ALTER TABLE `tracks`
  ADD PRIMARY KEY (`id`),
  ADD UNIQUE KEY `uq_track_layout` (`name`,`layout`);

--
-- AUTO_INCREMENT for dumped tables
--

--
-- AUTO_INCREMENT for table `cars`
--
ALTER TABLE `cars`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `car_param_ranges`
--
ALTER TABLE `car_param_ranges`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `drivers`
--
ALTER TABLE `drivers`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mg_bikes`
--
ALTER TABLE `mg_bikes`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mg_bike_options`
--
ALTER TABLE `mg_bike_options`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mg_recommendations`
--
ALTER TABLE `mg_recommendations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mg_rec_items`
--
ALTER TABLE `mg_rec_items`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mg_sessions`
--
ALTER TABLE `mg_sessions`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mg_session_feedback`
--
ALTER TABLE `mg_session_feedback`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mg_setups`
--
ALTER TABLE `mg_setups`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `mg_tracks`
--
ALTER TABLE `mg_tracks`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `recommendations`
--
ALTER TABLE `recommendations`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `recommendation_items`
--
ALTER TABLE `recommendation_items`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `setups`
--
ALTER TABLE `setups`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stints`
--
ALTER TABLE `stints`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `stint_feedback`
--
ALTER TABLE `stint_feedback`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tire_compounds`
--
ALTER TABLE `tire_compounds`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

--
-- AUTO_INCREMENT for table `tracks`
--
ALTER TABLE `tracks`
  MODIFY `id` int(10) UNSIGNED NOT NULL AUTO_INCREMENT;

-- --------------------------------------------------------

--
-- Structure for view `v_mg_setup_progress`
--
DROP TABLE IF EXISTS `v_mg_setup_progress`;

CREATE ALGORITHM=UNDEFINED DEFINER=`u652263477_team1986`@`127.0.0.1` SQL SECURITY DEFINER VIEW `v_mg_setup_progress`  AS SELECT `s`.`id` AS `setup_id`, `s`.`bike_id` AS `bike_id`, `s`.`track_id` AS `track_id`, `s`.`version` AS `version`, `s`.`name` AS `name`, `s`.`change_summary` AS `change_summary`, count(`x`.`id`) AS `session_count`, min(`x`.`best_lap_ms`) AS `best_lap_ms`, round(avg(`x`.`avg_lap_ms`),0) AS `mean_avg_lap_ms`, round(avg(`x`.`track_temp_c`),1) AS `mean_track_temp_c` FROM (`mg_setups` `s` left join `mg_sessions` `x` on(`x`.`setup_id` = `s`.`id`)) GROUP BY `s`.`id`, `s`.`bike_id`, `s`.`track_id`, `s`.`version`, `s`.`name`, `s`.`change_summary` ;

-- --------------------------------------------------------

--
-- Structure for view `v_setup_progress`
--
DROP TABLE IF EXISTS `v_setup_progress`;

CREATE ALGORITHM=UNDEFINED DEFINER=`u652263477_team1986`@`127.0.0.1` SQL SECURITY DEFINER VIEW `v_setup_progress`  AS SELECT `s`.`id` AS `setup_id`, `s`.`car_id` AS `car_id`, `s`.`track_id` AS `track_id`, `s`.`version` AS `version`, `s`.`name` AS `name`, `s`.`change_summary` AS `change_summary`, count(`st`.`id`) AS `stint_count`, min(`st`.`best_lap_ms`) AS `best_lap_ms`, round(avg(`st`.`avg_lap_ms`),0) AS `mean_avg_lap_ms`, round(avg(`st`.`track_temp_c`),1) AS `mean_track_temp_c` FROM (`setups` `s` left join `stints` `st` on(`st`.`setup_id` = `s`.`id`)) GROUP BY `s`.`id`, `s`.`car_id`, `s`.`track_id`, `s`.`version`, `s`.`name`, `s`.`change_summary` ;

--
-- Constraints for dumped tables
--

--
-- Constraints for table `car_param_ranges`
--
ALTER TABLE `car_param_ranges`
  ADD CONSTRAINT `fk_range_car` FOREIGN KEY (`car_id`) REFERENCES `cars` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_bike_options`
--
ALTER TABLE `mg_bike_options`
  ADD CONSTRAINT `fk_mg_option_bike` FOREIGN KEY (`bike_id`) REFERENCES `mg_bikes` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_bike_params`
--
ALTER TABLE `mg_bike_params`
  ADD CONSTRAINT `fk_mg_param_bike` FOREIGN KEY (`bike_id`) REFERENCES `mg_bikes` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_recommendations`
--
ALTER TABLE `mg_recommendations`
  ADD CONSTRAINT `fk_mg_rec_applied` FOREIGN KEY (`applied_setup_id`) REFERENCES `mg_setups` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_mg_rec_session` FOREIGN KEY (`session_id`) REFERENCES `mg_sessions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_rec_items`
--
ALTER TABLE `mg_rec_items`
  ADD CONSTRAINT `fk_mg_item_rec` FOREIGN KEY (`recommendation_id`) REFERENCES `mg_recommendations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_sessions`
--
ALTER TABLE `mg_sessions`
  ADD CONSTRAINT `fk_mg_session_setup` FOREIGN KEY (`setup_id`) REFERENCES `mg_setups` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_session_feedback`
--
ALTER TABLE `mg_session_feedback`
  ADD CONSTRAINT `fk_mg_feedback_session` FOREIGN KEY (`session_id`) REFERENCES `mg_sessions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_session_laps`
--
ALTER TABLE `mg_session_laps`
  ADD CONSTRAINT `fk_mg_lap_session` FOREIGN KEY (`session_id`) REFERENCES `mg_sessions` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_setups`
--
ALTER TABLE `mg_setups`
  ADD CONSTRAINT `fk_mg_setup_bike` FOREIGN KEY (`bike_id`) REFERENCES `mg_bikes` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_mg_setup_parent` FOREIGN KEY (`parent_setup_id`) REFERENCES `mg_setups` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_mg_setup_track` FOREIGN KEY (`track_id`) REFERENCES `mg_tracks` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_setup_choices`
--
ALTER TABLE `mg_setup_choices`
  ADD CONSTRAINT `fk_mg_choice_option` FOREIGN KEY (`option_id`) REFERENCES `mg_bike_options` (`id`),
  ADD CONSTRAINT `fk_mg_choice_setup` FOREIGN KEY (`setup_id`) REFERENCES `mg_setups` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `mg_setup_values`
--
ALTER TABLE `mg_setup_values`
  ADD CONSTRAINT `fk_mg_value_setup` FOREIGN KEY (`setup_id`) REFERENCES `mg_setups` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `recommendations`
--
ALTER TABLE `recommendations`
  ADD CONSTRAINT `fk_rec_applied` FOREIGN KEY (`applied_setup_id`) REFERENCES `setups` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_rec_stint` FOREIGN KEY (`stint_id`) REFERENCES `stints` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `recommendation_items`
--
ALTER TABLE `recommendation_items`
  ADD CONSTRAINT `fk_item_rec` FOREIGN KEY (`recommendation_id`) REFERENCES `recommendations` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `setups`
--
ALTER TABLE `setups`
  ADD CONSTRAINT `fk_setup_car` FOREIGN KEY (`car_id`) REFERENCES `cars` (`id`) ON DELETE CASCADE,
  ADD CONSTRAINT `fk_setup_compound` FOREIGN KEY (`compound_id`) REFERENCES `tire_compounds` (`id`),
  ADD CONSTRAINT `fk_setup_parent` FOREIGN KEY (`parent_setup_id`) REFERENCES `setups` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_setup_track` FOREIGN KEY (`track_id`) REFERENCES `tracks` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `setup_corners`
--
ALTER TABLE `setup_corners`
  ADD CONSTRAINT `fk_corner_setup` FOREIGN KEY (`setup_id`) REFERENCES `setups` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `stints`
--
ALTER TABLE `stints`
  ADD CONSTRAINT `fk_stint_driver` FOREIGN KEY (`driver_id`) REFERENCES `drivers` (`id`) ON DELETE SET NULL,
  ADD CONSTRAINT `fk_stint_setup` FOREIGN KEY (`setup_id`) REFERENCES `setups` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `stint_feedback`
--
ALTER TABLE `stint_feedback`
  ADD CONSTRAINT `fk_feedback_stint` FOREIGN KEY (`stint_id`) REFERENCES `stints` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `stint_laps`
--
ALTER TABLE `stint_laps`
  ADD CONSTRAINT `fk_lap_stint` FOREIGN KEY (`stint_id`) REFERENCES `stints` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `stint_tires`
--
ALTER TABLE `stint_tires`
  ADD CONSTRAINT `fk_tire_stint` FOREIGN KEY (`stint_id`) REFERENCES `stints` (`id`) ON DELETE CASCADE;

--
-- Constraints for table `tire_compounds`
--
ALTER TABLE `tire_compounds`
  ADD CONSTRAINT `fk_compound_car` FOREIGN KEY (`car_id`) REFERENCES `cars` (`id`) ON DELETE CASCADE;
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
