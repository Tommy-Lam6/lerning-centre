// index.js
import React from "react";

function HomePage() {
  return (
    <div className="min-h-screen flex flex-col">
      {/* Navbar */}
      <nav className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <h1 className="text-2xl font-bold text-blue-600">SmartEdu 補習社</h1>
          <ul className="hidden md:flex space-x-6 text-gray-700 font-medium">
            <li><a href="/" className="hover:text-blue-600">首頁</a></li>
            <li><a href="/about" className="hover:text-blue-600">關於我們</a></li>
            <li><a href="/contact" className="hover:text-blue-600">聯絡我們</a></li>
            <li><a href="/faq" className="hover:text-blue-600">FAQ</a></li>
            <li><a href="/login" className="hover:text-blue-600">登入</a></li>
          </ul>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white py-20">
        <div className="max-w-7xl mx-auto px-6 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            提升學習成效 · 開啟智能補習新時代
          </h2>
          <p className="text-lg mb-8">
            即時直播課堂、文件翻譯、智能測驗、課堂重溫 —— 一站式學習平台
          </p>
          <a
            href="/login"
            className="bg-white text-blue-700 font-semibold px-6 py-3 rounded-xl shadow hover:bg-gray-100 transition"
          >
            立即開始學習
          </a>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-6 py-16">
        <h3 className="text-3xl font-bold text-center mb-12">平台特色</h3>
        <div className="grid md:grid-cols-4 gap-8">
          <FeatureCard
            title="直播課堂"
            desc="老師即時授課，支援互動與即時提問"
          />
          <FeatureCard
            title="文件翻譯"
            desc="中英文對照翻譯，一行中文一行英文"
          />
          <FeatureCard
            title="學習專區"
            desc="上載文件自動生成試卷，智能評分與重溫"
          />
          <FeatureCard
            title="課堂重溫"
            desc="錄影回放，重溫課堂教材與筆記"
          />
        </div>
      </section>

      {/* Testimonials */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <h3 className="text-3xl font-bold text-center mb-12">學生見證</h3>
          <div className="grid md:grid-cols-3 gap-8">
            <TestimonialCard
              name="小明"
              text="由用 SmartEdu 之後，英文作文進步咗好多，因為可以自己重溫同做練習。"
            />
            <TestimonialCard
              name="阿玲"
              text="數學老師講解得好清楚，仲可以返屋企再睇返錄影，好方便！"
            />
            <TestimonialCard
              name="家長陳先生"
              text="平台可以睇到小朋友進度同錯題統計，好實用！"
            />
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-gray-800 text-gray-200 py-8 mt-auto">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between">
          <p>© 2025 SmartEdu 補習社. All rights reserved.</p>
          <div className="flex space-x-4 mt-4 md:mt-0">
            <a href="#" className="hover:text-white">Facebook</a>
            <a href="#" className="hover:text-white">Instagram</a>
            <a href="#" className="hover:text-white">YouTube</a>
          </div>
        </div>
      </footer>
    </div>
  );
}

// 小元件：FeatureCard
function FeatureCard({ title, desc }) {
  return (
    <div className="bg-white rounded-2xl shadow p-6 text-center">
      <h4 className="text-xl font-semibold mb-3 text-blue-600">{title}</h4>
      <p className="text-gray-600">{desc}</p>
    </div>
  );
}

// 小元件：TestimonialCard
function TestimonialCard({ name, text }) {
  return (
    <div className="bg-white rounded-2xl shadow p-6">
      <p className="text-gray-700 mb-4">“{text}”</p>
      <h5 className="font-semibold text-blue-600">— {name}</h5>
    </div>
  );
}

export default HomePage;
