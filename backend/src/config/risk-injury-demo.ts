// FICTIONAL scenarios for testing only. These are NOT these players' injury histories.
// Keep outside injury_histories and player_data_verifications; never mark verified.
export const riskInjuryDemos = [
  { id: "haaland", transfermarktId: 418560, name: "Erling Haaland", daysMissed: 45, ongoing: false },
  { id: "mbappe", transfermarktId: 342229, name: "Kylian Mbappé", daysMissed: 20, ongoing: false },
  { id: "salah", transfermarktId: 148455, name: "Mohamed Salah", daysMissed: 75, ongoing: false },
  { id: "van-dijk", transfermarktId: 139208, name: "Virgil van Dijk", daysMissed: 110, ongoing: false },
  { id: "saka", transfermarktId: 433177, name: "Bukayo Saka", daysMissed: 155, ongoing: true },
  { id: "bellingham", transfermarktId: 581678, name: "Jude Bellingham", daysMissed: 95, ongoing: false },
  { id: "vinicius", transfermarktId: 371998, name: "Vinicius Junior", daysMissed: 35, ongoing: false },
  { id: "rodri", transfermarktId: 357565, name: "Rodri", daysMissed: 280, ongoing: true },
  { id: "saliba", transfermarktId: 495666, name: "William Saliba", daysMissed: 0, ongoing: false },
  { id: "bruno-fernandes", transfermarktId: 240306, name: "Bruno Fernandes", daysMissed: 190, ongoing: false },
] as const;
export type RiskInjuryDemo = (typeof riskInjuryDemos)[number];
