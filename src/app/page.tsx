import HomeClient from './components/HomeClient';

export default function Home() {
  const spreadsheetUrl = `https://docs.google.com/spreadsheets/d/${process.env.SPREADSHEET_ID}/edit?gid=0#gid=0`;
  return <HomeClient spreadsheetUrl={spreadsheetUrl} />;
}
