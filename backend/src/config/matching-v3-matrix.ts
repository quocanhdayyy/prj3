// Generated from the reviewed workbook; regenerate with scripts/prepare-v3-matrix.py.
export const v3Matrix = {
  "version": "tactical-roles-v3-b70a5cddf2e4",
  "sourceFile": "ma_tran_trong_so_vai_tro_chien_thuat.xlsx",
  "sourceSha256": "b70a5cddf2e414d0ec4049c124645e1e6848755839feef44ae7eb8d79df9c144",
  "roles": [
    {
      "id": "NO_NONSENSE_CB",
      "name": "No-Nonsense CB",
      "description": "Trung vệ phá bóng",
      "group": "CB",
      "weights": {
        "progressivePassesPer90": 0.05,
        "passesCompletedPer90": 0.05,
        "possessionAdjustedTacklesPer90": 0.15,
        "possessionAdjustedInterceptionsPer90": 0.3,
        "aerialWinPercentage": 0.3,
        "pressuresPer90": 0.05,
        "pressureSuccessPercentage": 0.05,
        "sprintsPer90": 0.05
      }
    },
    {
      "id": "BALL_PLAYING_CB",
      "name": "Ball-Playing CB",
      "description": "Trung vệ triển khai bóng",
      "group": "CB",
      "weights": {
        "progressivePassesPer90": 0.28,
        "progressiveCarriesPer90": 0.1,
        "passesCompletedPer90": 0.2,
        "possessionAdjustedTacklesPer90": 0.08,
        "possessionAdjustedInterceptionsPer90": 0.12,
        "aerialWinPercentage": 0.15,
        "pressuresPer90": 0.03,
        "pressureSuccessPercentage": 0.02,
        "sprintsPer90": 0.02
      }
    },
    {
      "id": "STOPPER",
      "name": "Stopper",
      "description": "Trung vệ áp sát",
      "group": "CB",
      "weights": {
        "progressivePassesPer90": 0.04,
        "passesCompletedPer90": 0.04,
        "possessionAdjustedTacklesPer90": 0.22,
        "possessionAdjustedInterceptionsPer90": 0.22,
        "aerialWinPercentage": 0.25,
        "pressuresPer90": 0.08,
        "pressureSuccessPercentage": 0.12,
        "sprintsPer90": 0.03
      }
    },
    {
      "id": "COVERING_CB",
      "name": "Covering CB",
      "description": "Trung vệ bọc lót",
      "group": "CB",
      "weights": {
        "progressivePassesPer90": 0.05,
        "passesCompletedPer90": 0.1,
        "possessionAdjustedTacklesPer90": 0.15,
        "possessionAdjustedInterceptionsPer90": 0.3,
        "aerialWinPercentage": 0.2,
        "pressureSuccessPercentage": 0.05,
        "sprintsPer90": 0.1,
        "distanceKmPer90": 0.05
      }
    },
    {
      "id": "DEFENSIVE_FB",
      "name": "Defensive FB",
      "description": "Hậu vệ biên thiên thủ",
      "group": "FULLBACK",
      "weights": {
        "expectedAssistsPer90": 0.03,
        "progressivePassesPer90": 0.06,
        "passesCompletedPer90": 0.05,
        "possessionAdjustedTacklesPer90": 0.22,
        "possessionAdjustedInterceptionsPer90": 0.22,
        "aerialWinPercentage": 0.08,
        "pressuresPer90": 0.08,
        "pressureSuccessPercentage": 0.08,
        "sprintsPer90": 0.08,
        "distanceKmPer90": 0.1
      }
    },
    {
      "id": "ATTACKING_FB",
      "name": "Attacking FB",
      "description": "Hậu vệ biên thiên công",
      "group": "FULLBACK",
      "weights": {
        "assistsPer90": 0.05,
        "expectedAssistsPer90": 0.18,
        "keyPassesPer90": 0.1,
        "progressivePassesPer90": 0.15,
        "progressiveCarriesPer90": 0.12,
        "possessionAdjustedTacklesPer90": 0.05,
        "possessionAdjustedInterceptionsPer90": 0.04,
        "pressuresPer90": 0.04,
        "sprintsPer90": 0.15,
        "distanceKmPer90": 0.12
      }
    },
    {
      "id": "INVERTED_FB",
      "name": "Inverted FB",
      "description": "Hậu vệ biên bó trong",
      "group": "FULLBACK",
      "weights": {
        "assistsPer90": 0.02,
        "expectedAssistsPer90": 0.08,
        "keyPassesPer90": 0.05,
        "progressivePassesPer90": 0.25,
        "progressiveCarriesPer90": 0.08,
        "passesCompletedPer90": 0.2,
        "possessionAdjustedTacklesPer90": 0.08,
        "possessionAdjustedInterceptionsPer90": 0.1,
        "pressuresPer90": 0.06,
        "sprintsPer90": 0.03,
        "distanceKmPer90": 0.05
      }
    },
    {
      "id": "UNDERLAPPING_FB",
      "name": "Underlapping FB",
      "description": "Hậu vệ chạy chồng trong",
      "group": "FULLBACK",
      "weights": {
        "expectedGoalsPer90": 0.05,
        "assistsPer90": 0.05,
        "expectedAssistsPer90": 0.15,
        "keyPassesPer90": 0.12,
        "progressivePassesPer90": 0.15,
        "progressiveCarriesPer90": 0.18,
        "possessionAdjustedTacklesPer90": 0.05,
        "possessionAdjustedInterceptionsPer90": 0.04,
        "pressuresPer90": 0.03,
        "sprintsPer90": 0.1,
        "distanceKmPer90": 0.08
      }
    },
    {
      "id": "WING_BACK",
      "name": "Wing-Back",
      "description": "Hậu vệ cánh (hệ 3 trung vệ)",
      "group": "FULLBACK",
      "weights": {
        "assistsPer90": 0.04,
        "expectedAssistsPer90": 0.15,
        "keyPassesPer90": 0.1,
        "progressivePassesPer90": 0.1,
        "progressiveCarriesPer90": 0.12,
        "possessionAdjustedTacklesPer90": 0.08,
        "possessionAdjustedInterceptionsPer90": 0.06,
        "aerialWinPercentage": 0.03,
        "pressuresPer90": 0.05,
        "sprintsPer90": 0.13,
        "distanceKmPer90": 0.14
      }
    },
    {
      "id": "ANCHOR_MAN",
      "name": "Anchor Man",
      "description": "Mỏ neo phòng ngự",
      "group": "MIDFIELD",
      "weights": {
        "progressivePassesPer90": 0.1,
        "passesCompletedPer90": 0.15,
        "possessionAdjustedTacklesPer90": 0.18,
        "possessionAdjustedInterceptionsPer90": 0.25,
        "aerialWinPercentage": 0.1,
        "pressuresPer90": 0.06,
        "pressureSuccessPercentage": 0.06,
        "sprintsPer90": 0.02,
        "distanceKmPer90": 0.08
      }
    },
    {
      "id": "BALL_WINNING_MID",
      "name": "Ball-Winning Mid",
      "description": "Tiền vệ thu hồi bóng (Destroyer)",
      "group": "MIDFIELD",
      "weights": {
        "progressivePassesPer90": 0.04,
        "passesCompletedPer90": 0.04,
        "possessionAdjustedTacklesPer90": 0.2,
        "possessionAdjustedInterceptionsPer90": 0.2,
        "aerialWinPercentage": 0.05,
        "pressuresPer90": 0.15,
        "pressureSuccessPercentage": 0.15,
        "sprintsPer90": 0.04,
        "distanceKmPer90": 0.08,
        "attackingThirdRecoveriesPer90": 0.05
      }
    },
    {
      "id": "DEEP_LYING_PM",
      "name": "Deep-Lying PM",
      "description": "Nhạc trưởng lùi sâu",
      "group": "MIDFIELD",
      "weights": {
        "assistsPer90": 0.04,
        "expectedAssistsPer90": 0.15,
        "keyPassesPer90": 0.08,
        "progressivePassesPer90": 0.25,
        "progressiveCarriesPer90": 0.05,
        "passesCompletedPer90": 0.2,
        "possessionAdjustedTacklesPer90": 0.05,
        "possessionAdjustedInterceptionsPer90": 0.05,
        "pressuresPer90": 0.03,
        "sprintsPer90": 0.02,
        "distanceKmPer90": 0.08
      }
    },
    {
      "id": "HALF_BACK",
      "name": "Half-Back",
      "description": "Tiền vệ lùi thành trung vệ",
      "group": "MIDFIELD",
      "weights": {
        "expectedAssistsPer90": 0.05,
        "progressivePassesPer90": 0.22,
        "progressiveCarriesPer90": 0.05,
        "passesCompletedPer90": 0.22,
        "possessionAdjustedTacklesPer90": 0.1,
        "possessionAdjustedInterceptionsPer90": 0.15,
        "aerialWinPercentage": 0.08,
        "pressuresPer90": 0.04,
        "pressureSuccessPercentage": 0.04,
        "distanceKmPer90": 0.05
      }
    },
    {
      "id": "BOX_TO_BOX",
      "name": "Box-to-Box",
      "description": "Tiền vệ con thoi",
      "group": "MIDFIELD",
      "weights": {
        "goalsPer90": 0.04,
        "expectedGoalsPer90": 0.05,
        "assistsPer90": 0.04,
        "expectedAssistsPer90": 0.07,
        "keyPassesPer90": 0.08,
        "progressivePassesPer90": 0.14,
        "progressiveCarriesPer90": 0.12,
        "tacklesWonPer90": 0.1,
        "interceptionsPer90": 0.08,
        "pressuresPer90": 0.08,
        "sprintsPer90": 0.1,
        "distanceKmPer90": 0.1
      }
    },
    {
      "id": "CENTRAL_PM",
      "name": "Central PM",
      "description": "Tiền vệ kiến thiết trung tâm",
      "group": "MIDFIELD",
      "weights": {
        "expectedGoalsPer90": 0.03,
        "assistsPer90": 0.05,
        "expectedAssistsPer90": 0.15,
        "keyPassesPer90": 0.15,
        "progressivePassesPer90": 0.22,
        "progressiveCarriesPer90": 0.08,
        "passesCompletedPer90": 0.15,
        "possessionAdjustedTacklesPer90": 0.03,
        "possessionAdjustedInterceptionsPer90": 0.03,
        "pressuresPer90": 0.04,
        "sprintsPer90": 0.02,
        "distanceKmPer90": 0.05
      }
    },
    {
      "id": "MEZZALA",
      "name": "Mezzala",
      "description": "Tiền vệ lệch trung tâm",
      "group": "MIDFIELD",
      "weights": {
        "goalsPer90": 0.06,
        "expectedGoalsPer90": 0.1,
        "assistsPer90": 0.06,
        "expectedAssistsPer90": 0.14,
        "keyPassesPer90": 0.12,
        "progressivePassesPer90": 0.12,
        "progressiveCarriesPer90": 0.18,
        "possessionAdjustedTacklesPer90": 0.02,
        "possessionAdjustedInterceptionsPer90": 0.02,
        "pressuresPer90": 0.04,
        "sprintsPer90": 0.08,
        "distanceKmPer90": 0.06
      }
    },
    {
      "id": "CARRILERO",
      "name": "Carrilero",
      "description": "Tiền vệ hỗ trợ hành lang",
      "group": "MIDFIELD",
      "weights": {
        "expectedAssistsPer90": 0.05,
        "keyPassesPer90": 0.05,
        "progressivePassesPer90": 0.12,
        "progressiveCarriesPer90": 0.04,
        "passesCompletedPer90": 0.14,
        "possessionAdjustedTacklesPer90": 0.14,
        "possessionAdjustedInterceptionsPer90": 0.14,
        "pressuresPer90": 0.08,
        "pressureSuccessPercentage": 0.06,
        "sprintsPer90": 0.04,
        "distanceKmPer90": 0.14
      }
    },
    {
      "id": "ADVANCED_PM",
      "name": "Advanced PM",
      "description": "Nhạc trưởng tuyến trên",
      "group": "CAM",
      "weights": {
        "goalsPer90": 0.05,
        "expectedGoalsPer90": 0.08,
        "assistsPer90": 0.1,
        "expectedAssistsPer90": 0.22,
        "keyPassesPer90": 0.2,
        "progressivePassesPer90": 0.15,
        "progressiveCarriesPer90": 0.1,
        "passesCompletedPer90": 0.04,
        "pressuresPer90": 0.03,
        "distanceKmPer90": 0.03
      }
    },
    {
      "id": "TREQUARTISTA",
      "name": "Trequartista",
      "description": "Số 10 tự do",
      "group": "CAM",
      "weights": {
        "goalsPer90": 0.08,
        "expectedGoalsPer90": 0.1,
        "assistsPer90": 0.1,
        "expectedAssistsPer90": 0.2,
        "keyPassesPer90": 0.18,
        "progressivePassesPer90": 0.12,
        "progressiveCarriesPer90": 0.15,
        "passesCompletedPer90": 0.05,
        "sprintsPer90": 0.02
      }
    },
    {
      "id": "SHADOW_STRIKER",
      "name": "Shadow Striker",
      "description": "Tiền đạo bóng ma",
      "group": "CAM",
      "weights": {
        "goalsPer90": 0.2,
        "expectedGoalsPer90": 0.25,
        "assistsPer90": 0.05,
        "expectedAssistsPer90": 0.08,
        "keyPassesPer90": 0.07,
        "progressivePassesPer90": 0.05,
        "progressiveCarriesPer90": 0.1,
        "pressuresPer90": 0.05,
        "sprintsPer90": 0.1,
        "attackingThirdRecoveriesPer90": 0.05
      }
    },
    {
      "id": "WINGER",
      "name": "Winger",
      "description": "Tiền đạo cánh truyền thống",
      "group": "WING",
      "weights": {
        "goalsPer90": 0.05,
        "expectedGoalsPer90": 0.05,
        "assistsPer90": 0.1,
        "expectedAssistsPer90": 0.2,
        "keyPassesPer90": 0.18,
        "progressivePassesPer90": 0.03,
        "progressiveCarriesPer90": 0.2,
        "pressuresPer90": 0.03,
        "sprintsPer90": 0.12,
        "distanceKmPer90": 0.04
      }
    },
    {
      "id": "INVERTED_WINGER",
      "name": "Inverted Winger",
      "description": "Tiền đạo cánh nghịch chân",
      "group": "WING",
      "weights": {
        "goalsPer90": 0.1,
        "expectedGoalsPer90": 0.14,
        "assistsPer90": 0.05,
        "expectedAssistsPer90": 0.14,
        "keyPassesPer90": 0.12,
        "progressivePassesPer90": 0.05,
        "progressiveCarriesPer90": 0.2,
        "pressuresPer90": 0.05,
        "sprintsPer90": 0.1,
        "distanceKmPer90": 0.03,
        "attackingThirdRecoveriesPer90": 0.02
      }
    },
    {
      "id": "INSIDE_FORWARD",
      "name": "Inside Forward",
      "description": "Tiền đạo cánh bó vào trong",
      "group": "WING",
      "weights": {
        "goalsPer90": 0.22,
        "expectedGoalsPer90": 0.28,
        "assistsPer90": 0.05,
        "expectedAssistsPer90": 0.08,
        "keyPassesPer90": 0.06,
        "progressiveCarriesPer90": 0.12,
        "aerialWinPercentage": 0.02,
        "pressuresPer90": 0.04,
        "sprintsPer90": 0.1,
        "attackingThirdRecoveriesPer90": 0.03
      }
    },
    {
      "id": "WIDE_PLAYMAKER",
      "name": "Wide Playmaker",
      "description": "Nhà kiến thiết từ biên",
      "group": "WING",
      "weights": {
        "expectedGoalsPer90": 0.04,
        "assistsPer90": 0.08,
        "expectedAssistsPer90": 0.24,
        "keyPassesPer90": 0.22,
        "progressivePassesPer90": 0.15,
        "progressiveCarriesPer90": 0.12,
        "passesCompletedPer90": 0.06,
        "pressuresPer90": 0.03,
        "sprintsPer90": 0.03,
        "distanceKmPer90": 0.03
      }
    },
    {
      "id": "DEFENSIVE_WINGER",
      "name": "Defensive Winger",
      "description": "Cầu thủ cánh hỗ trợ phòng ngự",
      "group": "WING",
      "weights": {
        "expectedGoalsPer90": 0.02,
        "expectedAssistsPer90": 0.05,
        "keyPassesPer90": 0.04,
        "progressiveCarriesPer90": 0.06,
        "possessionAdjustedTacklesPer90": 0.14,
        "possessionAdjustedInterceptionsPer90": 0.1,
        "pressuresPer90": 0.18,
        "pressureSuccessPercentage": 0.15,
        "sprintsPer90": 0.08,
        "distanceKmPer90": 0.12,
        "attackingThirdRecoveriesPer90": 0.06
      }
    },
    {
      "id": "POACHER",
      "name": "Poacher",
      "description": "Sát thủ vòng cấm",
      "group": "ST",
      "weights": {
        "goalsPer90": 0.3,
        "expectedGoalsPer90": 0.35,
        "assistsPer90": 0.05,
        "expectedAssistsPer90": 0.05,
        "keyPassesPer90": 0.05,
        "aerialWinPercentage": 0.15,
        "sprintsPer90": 0.05
      }
    },
    {
      "id": "TARGET_MAN",
      "name": "Target Man",
      "description": "Tiền đạo mục tiêu",
      "group": "ST",
      "weights": {
        "goalsPer90": 0.18,
        "expectedGoalsPer90": 0.2,
        "assistsPer90": 0.05,
        "expectedAssistsPer90": 0.06,
        "keyPassesPer90": 0.06,
        "passesCompletedPer90": 0.05,
        "aerialWinPercentage": 0.3,
        "pressuresPer90": 0.03,
        "distanceKmPer90": 0.04,
        "attackingThirdRecoveriesPer90": 0.03
      }
    },
    {
      "id": "FALSE_NINE",
      "name": "False Nine",
      "description": "Số 9 ảo",
      "group": "ST",
      "weights": {
        "goalsPer90": 0.08,
        "expectedGoalsPer90": 0.1,
        "assistsPer90": 0.07,
        "expectedAssistsPer90": 0.18,
        "keyPassesPer90": 0.16,
        "progressivePassesPer90": 0.14,
        "progressiveCarriesPer90": 0.12,
        "passesCompletedPer90": 0.1,
        "pressuresPer90": 0.02,
        "distanceKmPer90": 0.03
      }
    },
    {
      "id": "DEEP_LYING_FWD",
      "name": "Deep-Lying Fwd",
      "description": "Tiền đạo lùi sâu",
      "group": "ST",
      "weights": {
        "goalsPer90": 0.14,
        "expectedGoalsPer90": 0.18,
        "assistsPer90": 0.06,
        "expectedAssistsPer90": 0.14,
        "keyPassesPer90": 0.12,
        "progressivePassesPer90": 0.12,
        "progressiveCarriesPer90": 0.08,
        "passesCompletedPer90": 0.08,
        "aerialWinPercentage": 0.04,
        "pressuresPer90": 0.04
      }
    },
    {
      "id": "ADVANCED_FWD",
      "name": "Advanced Fwd",
      "description": "Tiền đạo chơi cao",
      "group": "ST",
      "weights": {
        "goalsPer90": 0.25,
        "expectedGoalsPer90": 0.3,
        "assistsPer90": 0.04,
        "expectedAssistsPer90": 0.05,
        "keyPassesPer90": 0.02,
        "progressiveCarriesPer90": 0.08,
        "aerialWinPercentage": 0.05,
        "pressuresPer90": 0.02,
        "sprintsPer90": 0.15,
        "attackingThirdRecoveriesPer90": 0.04
      }
    },
    {
      "id": "PRESSING_FWD",
      "name": "Pressing Fwd",
      "description": "Tiền đạo pressing",
      "group": "ST",
      "weights": {
        "goalsPer90": 0.17,
        "expectedGoalsPer90": 0.22,
        "assistsPer90": 0.06,
        "expectedAssistsPer90": 0.06,
        "keyPassesPer90": 0.05,
        "progressiveCarriesPer90": 0.06,
        "aerialWinPercentage": 0.05,
        "pressuresPer90": 0.12,
        "pressureSuccessPercentage": 0.08,
        "sprintsPer90": 0.05,
        "attackingThirdRecoveriesPer90": 0.08
      }
    },
    {
      "id": "COMPLETE_FWD",
      "name": "Complete Fwd",
      "description": "Tiền đạo toàn diện",
      "group": "ST",
      "weights": {
        "goalsPer90": 0.15,
        "expectedGoalsPer90": 0.2,
        "assistsPer90": 0.06,
        "expectedAssistsPer90": 0.1,
        "keyPassesPer90": 0.08,
        "progressivePassesPer90": 0.05,
        "progressiveCarriesPer90": 0.08,
        "passesCompletedPer90": 0.03,
        "aerialWinPercentage": 0.1,
        "pressuresPer90": 0.06,
        "sprintsPer90": 0.05,
        "attackingThirdRecoveriesPer90": 0.04
      }
    },
    {
      "id": "SECOND_STRIKER",
      "name": "Second Striker",
      "description": "Tiền đạo thứ hai",
      "group": "ST",
      "weights": {
        "goalsPer90": 0.18,
        "expectedGoalsPer90": 0.22,
        "assistsPer90": 0.08,
        "expectedAssistsPer90": 0.12,
        "keyPassesPer90": 0.12,
        "progressiveCarriesPer90": 0.1,
        "passesCompletedPer90": 0.03,
        "pressuresPer90": 0.05,
        "sprintsPer90": 0.06,
        "attackingThirdRecoveriesPer90": 0.04
      }
    },
    {
      "id": "TRADITIONAL_GK",
      "name": "Traditional GK",
      "description": "Thủ môn truyền thống",
      "group": "GK",
      "weights": {
        "goalsPreventedPer90": 0.4,
        "savePercentage": 0.2,
        "crossStopPercentage": 0.25,
        "defensiveActionsOutsideBoxPer90": 0.05,
        "passesCompletedPer90": 0.05,
        "progressivePassesPer90": 0.05
      }
    },
    {
      "id": "SWEEPER_KEEPER",
      "name": "Sweeper Keeper",
      "description": "Thủ môn quét",
      "group": "GK",
      "weights": {
        "goalsPreventedPer90": 0.2,
        "savePercentage": 0.1,
        "crossStopPercentage": 0.1,
        "defensiveActionsOutsideBoxPer90": 0.3,
        "passesCompletedPer90": 0.1,
        "progressivePassesPer90": 0.2
      }
    }
  ]
};
