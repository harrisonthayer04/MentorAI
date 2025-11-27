import ThemeToggle from './components/ThemeToggle';
import Link from 'next/link';

export default function Home() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50 overflow-hidden">
      {/* Subtle gradient orbs for depth */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-0 left-1/4 w-[600px] h-[600px] bg-indigo-500/10 rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-1/4 w-[500px] h-[500px] bg-cyan-500/10 rounded-full blur-[100px]" />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 px-6 py-4" style={{ animation: "fade-in 0.4s ease-out" }}>
        <div className="mx-auto max-w-6xl flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-500 to-cyan-400 flex items-center justify-center">
              <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <span className="text-lg font-display font-bold tracking-tight">MentorAI</span>
          </div>
          
          <div className="flex items-center gap-4">
            <Link
              href="/signin"
              className="px-5 py-2.5 rounded-xl font-display font-semibold text-sm bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 text-white shadow-lg shadow-indigo-500/20 transition-all hover:shadow-indigo-500/30 hover:-translate-y-0.5"
            >
              Get Started
            </Link>
            <ThemeToggle />
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <main className="relative z-10 px-6 pt-16 pb-24 md:pt-24 md:pb-32">
        <div className="mx-auto max-w-6xl">
          {/* Badge */}
          <div 
            className="inline-flex items-center gap-2 rounded-full bg-zinc-800/80 px-4 py-1.5 text-sm text-zinc-300 border border-zinc-700/50 mb-8"
            style={{ animation: "fade-in-up 0.5s ease-out" }}
          >
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400"></span>
            </span>
            AI-powered personalized learning
          </div>

          {/* Headline */}
          <h1 
            className="text-5xl md:text-7xl lg:text-8xl font-display font-extrabold tracking-tight leading-[0.95] max-w-4xl"
            style={{ animation: "fade-in-up 0.6s ease-out" }}
          >
            Learn anything,{" "}
            <span className="gradient-text">your way</span>
          </h1>

          {/* Subheadline */}
          <p 
            className="mt-6 text-lg md:text-xl text-zinc-400 max-w-2xl leading-relaxed"
            style={{ animation: "fade-in-up 0.7s ease-out" }}
          >
            An intelligent tutor that adapts to your pace, understands your goals, and remembers your progress. Start learning smarter today.
          </p>

          {/* CTA Buttons */}
          <div 
            className="mt-10 flex flex-wrap gap-4"
            style={{ animation: "fade-in-up 0.8s ease-out" }}
          >
            <Link
              href="/signin"
              className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-display font-semibold text-white bg-gradient-to-r from-indigo-500 to-indigo-600 hover:from-indigo-400 hover:to-indigo-500 shadow-xl shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 hover:-translate-y-0.5"
            >
              Start Learning
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13 7l5 5m0 0l-5 5m5-5H6" />
              </svg>
            </Link>
            <button className="inline-flex items-center gap-2 px-6 py-3.5 rounded-xl font-display font-semibold text-zinc-300 bg-zinc-800/80 border border-zinc-700/50 hover:bg-zinc-800 hover:border-zinc-600 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Watch Demo
            </button>
          </div>

          {/* Feature Preview Cards */}
          <div 
            className="mt-20 grid grid-cols-1 md:grid-cols-3 gap-4"
            style={{ animation: "fade-in-up 0.9s ease-out" }}
          >
            {/* Card 1 */}
            <div className="group p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500/20 to-indigo-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold text-zinc-100 mb-2">Natural Conversation</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">Chat naturally with voice or text. Your AI tutor understands context and remembers your learning journey.</p>
            </div>

            {/* Card 2 */}
            <div className="group p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-cyan-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold text-zinc-100 mb-2">Adaptive Learning</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">Personalized teaching that adjusts to your skill level, learning style, and goals in real-time.</p>
            </div>

            {/* Card 3 */}
            <div className="group p-6 rounded-2xl bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 transition-all hover:-translate-y-1">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500/20 to-emerald-500/10 flex items-center justify-center mb-4">
                <svg className="w-5 h-5 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4M7.835 4.697a3.42 3.42 0 001.946-.806 3.42 3.42 0 014.438 0 3.42 3.42 0 001.946.806 3.42 3.42 0 013.138 3.138 3.42 3.42 0 00.806 1.946 3.42 3.42 0 010 4.438 3.42 3.42 0 00-.806 1.946 3.42 3.42 0 01-3.138 3.138 3.42 3.42 0 00-1.946.806 3.42 3.42 0 01-4.438 0 3.42 3.42 0 00-1.946-.806 3.42 3.42 0 01-3.138-3.138 3.42 3.42 0 00-.806-1.946 3.42 3.42 0 010-4.438 3.42 3.42 0 00.806-1.946 3.42 3.42 0 013.138-3.138z" />
                </svg>
              </div>
              <h3 className="text-lg font-display font-semibold text-zinc-100 mb-2">Long-term Memory</h3>
              <p className="text-sm text-zinc-400 leading-relaxed">Your tutor remembers your progress, preferences, and past conversations across all sessions.</p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 px-6 py-6 border-t border-zinc-800/50">
        <div className="mx-auto max-w-6xl flex flex-col md:flex-row justify-between items-center gap-4">
          <p className="text-sm text-zinc-500">
            Made for students, by students.
          </p>
          <div className="flex items-center gap-6 text-sm text-zinc-500">
            <a href="#" className="hover:text-zinc-300 transition-colors">Privacy</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Terms</a>
            <a href="#" className="hover:text-zinc-300 transition-colors">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
