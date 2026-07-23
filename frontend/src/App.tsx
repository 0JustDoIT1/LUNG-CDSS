import './App.css';

function App() {
  return (
    <div className="container mx-auto mt-10 px-4">
      <h1 className="text-2xl font-bold mb-4">케이스 목록</h1>
      <div className="bg-blue-50 border border-blue-200 text-blue-800 rounded-lg p-4 mb-4">
        Tailwind CSS 적용 확인용 페이지입니다.
      </div>
      <button className="bg-blue-600 hover:bg-blue-700 text-white font-medium px-4 py-2 rounded-lg transition">
        새 케이스
      </button>
    </div>
  );
}

export default App;
