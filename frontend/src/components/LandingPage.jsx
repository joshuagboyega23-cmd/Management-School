import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  GraduationCap, BookOpen, Users, Trophy, Phone, Mail, MapPin,
  ChevronRight, Star, Shield, Globe, Clock, ArrowRight, Menu, X,
  Award, Target, Heart
} from 'lucide-react';

// ─── School Configuration (PLACEHOLDERS) ──────────────────────────────────────
// NOTE: Flagged placeholders below can be replaced with the real school's actual details.
const SCHOOL = {
  // PLACEHOLDER: Replace with actual school name
  name: 'Pinnacle Heights Academy',
  // PLACEHOLDER: Replace with actual school tagline/mission slogan
  tagline: 'Nurturing Excellence, Building Futures',
  // PLACEHOLDER: Replace with actual school motto
  motto: '"Knowledge · Character · Service"',
  // PLACEHOLDER: Replace with year school was founded (number)
  established: 1998,
  // PLACEHOLDER: Replace with physical street address
  address: '14 Excellence Boulevard, Lekki Phase 1, Lagos State, Nigeria',
  // PLACEHOLDER: Replace with primary office phone number
  phone: '+234 (0) 801 234 5678',
  // PLACEHOLDER: Replace with secondary phone / admissions line
  phone2: '+234 (0) 901 234 5678',
  // PLACEHOLDER: Replace with main official email address
  email: 'info@pinnacleheights.edu.ng',
  // PLACEHOLDER: Replace with admissions department email address
  admissions: 'admissions@pinnacleheights.edu.ng',
  // PLACEHOLDER: Replace with Principal / Head of School name and qualifications
  principalName: 'Mrs. Adaora Nwosu, M.Ed.',
  // PLACEHOLDER: Replace with official accreditation bodies / affiliations
  accreditation: 'Fully accredited by WAEC · NECO · Lagos State Ministry of Education',
};

// PLACEHOLDER: Replace with actual school statistics and impact metrics
const STATS = [
  // PLACEHOLDER: Total enrolled students count
  { value: '2,400+', label: 'Enrolled Students', icon: Users },
  // PLACEHOLDER: Exam / WAEC success pass rate
  { value: '98%', label: 'WAEC Pass Rate', icon: Trophy },
  // PLACEHOLDER: Total teaching & non-teaching staff
  { value: '120+', label: 'Qualified Staff', icon: Star },
  // PLACEHOLDER: Years of operation / excellence
  { value: '26', label: 'Years of Excellence', icon: Award },
];

// PLACEHOLDER: Replace with actual school features, tracks, facilities, and programs
const FEATURES = [
  {
    icon: BookOpen,
    // PLACEHOLDER: Feature title
    title: 'Robust Curriculum',
    // PLACEHOLDER: Feature description
    desc: 'Junior and Senior Secondary curriculum aligned with NERDC standards, offering Sciences, Arts, Commercial and Technical tracks.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Trophy,
    // PLACEHOLDER: Feature title
    title: 'Award-Winning Sports',
    // PLACEHOLDER: Feature description
    desc: 'State and national championships in football, athletics, basketball and table tennis. Olympians trained here.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: Shield,
    // PLACEHOLDER: Feature title
    title: 'Safe & Secure Campus',
    // PLACEHOLDER: Feature description
    desc: '24/7 CCTV surveillance, gated compound, trained security personnel and a full-time nurse on duty every day.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Globe,
    // PLACEHOLDER: Feature title
    title: 'ICT & STEM Labs',
    // PLACEHOLDER: Feature description
    desc: 'Modern computer labs, robotics bay, science labs with up-to-date equipment and high-speed campus Wi-Fi.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    icon: Heart,
    // PLACEHOLDER: Feature title
    title: 'Student Wellbeing',
    // PLACEHOLDER: Feature description
    desc: 'Licensed school counsellors, a health bay, active peer-mentorship programmes and mental health awareness campaigns.',
    color: 'bg-rose-50 text-rose-600',
  },
  {
    icon: Target,
    // PLACEHOLDER: Feature title
    title: 'Extra-Curricular Clubs',
    // PLACEHOLDER: Feature description
    desc: '30+ clubs including debate, drama, press, coding, chess, Red Cross, music and cultural dance troupes.',
    color: 'bg-amber-50 text-amber-600',
  },
];

// PLACEHOLDER: Replace with actual school announcements and news articles
const NEWS = [
  {
    date: 'Sep 15, 2026',
    category: 'Academics',
    title: 'Pinnacle Students Sweep 2026 WAEC with Distinction',
    excerpt: 'Over 94% of our SS3 candidates obtained credits in 5 or more subjects, with 12 students achieving straight A\'s in all 9 papers.',
  },
  {
    date: 'Sep 5, 2026',
    category: 'Sports',
    title: 'Our U-17 Football Team Wins Lagos State Championship',
    excerpt: 'The Pinnacle Eagles defeated 32 schools to clinch the Lagos State Inter-Secondary Schools Football Championship for the third consecutive year.',
  },
  {
    date: 'Aug 28, 2026',
    category: 'Admissions',
    title: 'JSS1 & SS1 Admissions Now Open for 2026/2027 Session',
    excerpt: 'Applications are now open for the new academic session. Limited spaces available. Visit the school or call our admissions line today.',
  },
];

// PLACEHOLDER: Classes offered by the school
const CLASSES = ['JSS 1', 'JSS 2', 'JSS 3', 'SS 1', 'SS 2', 'SS 3'];

// ─── Nav ──────────────────────────────────────────────────────────────────────
function Navbar({ onEnterPortal }) {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = ['About', 'Academics', 'Admissions', 'News', 'Contact'];

  return (
    <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white shadow-md' : 'bg-transparent'}`}>
      {/* Top bar */}
      <div className="bg-blue-900 text-blue-100 text-xs py-1.5 px-6 flex justify-between items-center">
        <span>{SCHOOL.accreditation}</span>
        <span className="hidden sm:block">{SCHOOL.phone} &nbsp;|&nbsp; {SCHOOL.email}</span>
      </div>

      {/* Main nav */}
      <div className="max-w-7xl mx-auto px-6 py-3 flex items-center justify-between">
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div className="bg-blue-700 rounded-full p-2">
            <GraduationCap className="h-7 w-7 text-white" />
          </div>
          <div>
            <p className="font-extrabold text-blue-900 leading-tight text-base">{SCHOOL.name}</p>
            <p className="text-xs text-blue-600 leading-tight hidden sm:block">Est. {SCHOOL.established}</p>
          </div>
        </div>

        {/* Desktop links */}
        <div className="hidden md:flex items-center gap-6">
          {links.map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`}
              className="text-sm font-medium text-slate-700 hover:text-blue-700 transition">
              {l}
            </a>
          ))}
        </div>

        {/* CTA */}
        <div className="hidden md:flex items-center gap-3">
          <Link
            to="/login"
            className="text-slate-700 hover:text-blue-700 text-xs font-semibold px-3 py-2 rounded-lg transition"
          >
            Student & Parent Login
          </Link>
          <Link
            to="/teacher-login"
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 shadow"
          >
            Teacher Login
          </Link>
          <Link
            to="/admin-login"
            className="bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold px-3.5 py-2 rounded-lg transition flex items-center gap-1.5 shadow"
          >
            Admin Portal
          </Link>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="h-6 w-6 text-slate-700" /> : <Menu className="h-6 w-6 text-slate-700" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 flex flex-col gap-3 shadow-lg">
          {links.map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`}
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-slate-700 hover:text-blue-700">
              {l}
            </a>
          ))}
          <Link
            to="/login"
            onClick={() => setOpen(false)}
            className="bg-blue-700 text-white text-sm font-semibold px-5 py-2.5 rounded-lg text-center"
          >
            Student & Parent Portal
          </Link>
          <Link
            to="/teacher-login"
            onClick={() => setOpen(false)}
            className="bg-indigo-600 text-white text-sm font-semibold px-5 py-2.5 rounded-lg text-center"
          >
            Teacher Portal Login
          </Link>
          <Link
            to="/admin-login"
            onClick={() => setOpen(false)}
            className="bg-slate-900 text-white text-sm font-semibold px-5 py-2.5 rounded-lg text-center"
          >
            Admin Portal
          </Link>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero() {
  return (
    <section
      className="relative min-h-screen flex flex-col justify-between bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 text-white overflow-hidden"
      style={{
        backgroundImage: `url('/src/assets/hero.png')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      }}
    >
      {/* Overlay */}
      <div className="absolute inset-0 bg-blue-950/75" />

      {/* Decorative circle */}
      <div className="absolute -top-32 -right-32 w-[500px] h-[500px] rounded-full bg-blue-600/20 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 w-[400px] h-[400px] rounded-full bg-yellow-400/10 blur-3xl" />

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center pt-32 pb-12 md:py-36 my-auto">
        <span className="inline-block bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-xs font-semibold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6">
          {SCHOOL.motto}
        </span>

        <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-tight mb-6 drop-shadow-xl">
          {SCHOOL.name}
        </h1>

        <p className="text-blue-200 text-base sm:text-lg md:text-xl max-w-2xl mx-auto mb-3">
          {SCHOOL.tagline}
        </p>
        <p className="text-blue-300/70 text-xs sm:text-sm mb-8 sm:mb-10">
          Established {SCHOOL.established} &nbsp;·&nbsp; JSS1 – SS3 &nbsp;·&nbsp; Lagos, Nigeria
        </p>

        <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center">
          <a href="#admissions"
            className="bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-bold px-7 py-3.5 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg">
            Apply for Admission <ChevronRight className="h-4 w-4" />
          </a>
          <Link
            to="/admin-login"
            className="bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 text-white font-semibold px-7 py-3.5 rounded-xl text-sm transition flex items-center justify-center gap-2">
            Admin Portal Sign In <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/teacher-login"
            className="bg-indigo-600 hover:bg-indigo-500 backdrop-blur border border-indigo-400/40 text-white font-semibold px-7 py-3.5 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg">
            Teacher Portal Login <ChevronRight className="h-4 w-4" />
          </Link>
        </div>

        {/* Discreet Student & Parent Portal link */}
        <div className="mt-8 mb-4 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs text-blue-300/80">
          <span className="text-blue-300/60 font-medium">Students & Parents:</span>
          <Link to="/login" className="hover:text-white underline transition">
            Student / Parent Sign In
          </Link>
          <span>·</span>
          <Link to="/register" className="hover:text-white underline transition">
            Register Account
          </Link>
        </div>
      </div>

      {/* Stat bar */}
      <div className="relative z-10 w-full bg-blue-950/85 backdrop-blur border-t border-white/10 mt-auto">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px">
          {STATS.map(({ value, label, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center py-4 sm:py-5 px-3 sm:px-4 text-center">
              <Icon className="h-5 w-5 text-yellow-400 mb-1" />
              <span className="text-xl sm:text-2xl font-extrabold text-white">{value}</span>
              <span className="text-blue-300 text-xs mt-0.5">{label}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── About ────────────────────────────────────────────────────────────────────
function About() {
  return (
    <section id="about" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
        {/* Text */}
        <div>
          <span className="text-blue-600 text-xs font-bold uppercase tracking-widest">About Us</span>
          <h2 className="text-4xl font-extrabold text-slate-900 mt-2 mb-6 leading-tight">
            A Legacy of Academic <br />Excellence Since {SCHOOL.established}
          </h2>
          <p className="text-slate-600 leading-relaxed mb-4">
            Pinnacle Heights Academy was founded with a singular vision: to provide every Nigerian child with
            world-class secondary education that fosters intellectual curiosity, moral integrity and civic responsibility.
          </p>
          <p className="text-slate-600 leading-relaxed mb-4">
            Over 26 years, we have produced hundreds of WAEC best candidates, federal scholarship winners, doctors,
            engineers, lawyers, entrepreneurs and leaders across every sector.
          </p>
          <p className="text-slate-600 leading-relaxed mb-8">
            Our Principal, <strong>{SCHOOL.principalName}</strong>, leads a team of over 120 qualified and experienced
            educators committed to the holistic development of every student.
          </p>
          <a href="#admissions"
            className="inline-flex items-center gap-2 bg-blue-700 hover:bg-blue-800 text-white font-semibold px-6 py-3 rounded-lg text-sm transition">
            Enrol Your Child Today <ChevronRight className="h-4 w-4" />
          </a>
        </div>

        {/* Info card */}
        <div className="bg-gradient-to-br from-blue-50 to-blue-100 rounded-2xl p-8 space-y-5 shadow-inner">
          {[
            { label: 'School Type', value: 'Co-educational Day & Boarding' },
            { label: 'Classes Offered', value: CLASSES.join(', ') },
            { label: 'School Session', value: '3 Terms per academic year' },
            { label: 'Principal', value: SCHOOL.principalName },
            { label: 'Accreditation', value: 'WAEC · NECO · Lagos State Ministry of Edu.' },
            { label: 'Ownership', value: 'Private (Registered NGO)' },
          ].map(({ label, value }) => (
            <div key={label} className="flex justify-between items-start gap-4 border-b border-blue-200 pb-4 last:border-0 last:pb-0">
              <span className="text-xs font-semibold text-blue-800 uppercase tracking-wide shrink-0">{label}</span>
              <span className="text-sm text-slate-700 text-right">{value}</span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Academics ───────────────────────────────────────────────────────────────
function Academics() {
  return (
    <section id="academics" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-blue-600 text-xs font-bold uppercase tracking-widest">Why Choose Us</span>
          <h2 className="text-4xl font-extrabold text-slate-900 mt-2">
            World-Class Learning Environment
          </h2>
          <p className="text-slate-500 mt-3 max-w-xl mx-auto text-sm">
            From state-of-the-art labs to award-winning sports, every aspect of school life at Pinnacle Heights is designed to unlock potential.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map(({ icon: Icon, title, desc, color }) => (
            <div key={title}
              className="bg-white rounded-2xl p-7 shadow-sm border border-slate-100 hover:shadow-md transition group">
              <div className={`inline-flex p-3 rounded-xl mb-5 ${color} group-hover:scale-110 transition-transform`}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800 mb-2">{title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Admissions ──────────────────────────────────────────────────────────────
function Admissions() {
  return (
    <section id="admissions" className="py-24 bg-blue-900 text-white">
      <div className="max-w-7xl mx-auto px-6 grid md:grid-cols-2 gap-16 items-center">
        <div>
          <span className="text-yellow-400 text-xs font-bold uppercase tracking-widest">Admissions 2026/2027</span>
          <h2 className="text-4xl font-extrabold mt-2 mb-6 leading-tight">
            Secure Your Child's Place at Pinnacle Heights
          </h2>
          <p className="text-blue-200 leading-relaxed mb-6">
            We admit students into JSS1 and SS1 at the beginning of each session. Entry is based on our
            entrance examination and interview. Boarding places are limited.
          </p>

          <div className="space-y-4">
            {[
              { step: '01', title: 'Purchase Application Form', desc: 'Available at the school office or online via our admissions email.' },
              { step: '02', title: 'Sit the Entrance Examination', desc: 'Examinations hold every February and July. Past questions are available.' },
              { step: '03', title: 'Attend Interview', desc: 'Shortlisted candidates and a parent/guardian are invited for interview.' },
              { step: '04', title: 'Receive Admission Letter', desc: 'Successful candidates receive an offer letter and joining instructions.' },
            ].map(({ step, title, desc }) => (
              <div key={step} className="flex gap-4 items-start">
                <span className="bg-yellow-400 text-blue-900 font-extrabold text-sm px-3 py-1 rounded-full shrink-0 mt-0.5">{step}</span>
                <div>
                  <p className="font-semibold text-sm">{title}</p>
                  <p className="text-blue-300 text-xs mt-0.5">{desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-8 flex gap-4">
            <a href={`mailto:${SCHOOL.admissions}`}
              className="bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-bold px-6 py-3 rounded-lg text-sm transition">
              Email Admissions Office
            </a>
            <a href={`tel:${SCHOOL.phone}`}
              className="border border-white/30 hover:bg-white/10 text-white font-semibold px-6 py-3 rounded-lg text-sm transition">
              Call Us
            </a>
          </div>
        </div>

        {/* Fee schedule card */}
        <div className="bg-white/10 backdrop-blur border border-white/20 rounded-2xl p-8">
          <h3 className="text-lg font-bold mb-6 border-b border-white/20 pb-4">School Fee Schedule (Per Term)</h3>
          <div className="space-y-3">
            {[
              { level: 'JSS 1 – JSS 3 (Day)', fee: '₦85,000' },
              { level: 'JSS 1 – JSS 3 (Boarding)', fee: '₦175,000' },
              { level: 'SS 1 – SS 3 (Day)', fee: '₦95,000' },
              { level: 'SS 1 – SS 3 (Boarding)', fee: '₦195,000' },
            ].map(({ level, fee }) => (
              <div key={level} className="flex justify-between items-center border-b border-white/10 pb-3 last:border-0">
                <span className="text-sm text-blue-100">{level}</span>
                <span className="text-yellow-400 font-bold text-sm">{fee}</span>
              </div>
            ))}
          </div>
          <p className="text-blue-300 text-xs mt-5">
            * Fees include tuition, textbooks and development levy. Boarding includes meals &amp; laundry.
            Payment accepted via bank transfer or our online portal.
          </p>
          <div className="mt-6 bg-yellow-400/10 border border-yellow-400/30 rounded-xl p-4">
            <p className="text-yellow-300 font-semibold text-sm mb-1">🎓 Scholarship Available</p>
            <p className="text-blue-200 text-xs">Top-performing students may qualify for partial or full fee waivers. Contact the admissions office for details.</p>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── News ─────────────────────────────────────────────────────────────────────
function News() {
  const categoryColors = {
    Academics: 'bg-blue-100 text-blue-700',
    Sports: 'bg-emerald-100 text-emerald-700',
    Admissions: 'bg-yellow-100 text-yellow-700',
  };

  return (
    <section id="news" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-blue-600 text-xs font-bold uppercase tracking-widest">Latest Updates</span>
          <h2 className="text-4xl font-extrabold text-slate-900 mt-2">News &amp; Announcements</h2>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {NEWS.map(({ date, category, title, excerpt }) => (
            <article key={title}
              className="rounded-2xl border border-slate-100 shadow-sm hover:shadow-md transition overflow-hidden bg-white group">
              <div className="bg-gradient-to-br from-blue-100 to-blue-200 h-40 flex items-center justify-center">
                <BookOpen className="h-14 w-14 text-blue-400 group-hover:scale-110 transition-transform" />
              </div>
              <div className="p-6">
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${categoryColors[category]}`}>{category}</span>
                  <span className="text-xs text-slate-400">{date}</span>
                </div>
                <h3 className="font-bold text-slate-800 text-base leading-snug mb-2">{title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{excerpt}</p>
                <button className="mt-4 text-blue-600 text-xs font-semibold flex items-center gap-1 hover:gap-2 transition-all">
                  Read more <ChevronRight className="h-3 w-3" />
                </button>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Contact ─────────────────────────────────────────────────────────────────
function Contact() {
  return (
    <section id="contact" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-6">
        <div className="text-center mb-14">
          <span className="text-blue-600 text-xs font-bold uppercase tracking-widest">Get in Touch</span>
          <h2 className="text-4xl font-extrabold text-slate-900 mt-2">Contact Us</h2>
          <p className="text-slate-500 mt-3 text-sm max-w-md mx-auto">
            We're happy to answer your questions about admissions, academics or anything else.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-12 items-start">
          {/* Info */}
          <div className="space-y-6">
            {[
              {
                icon: MapPin, label: 'School Address',
                lines: [SCHOOL.address],
                color: 'text-blue-600 bg-blue-50'
              },
              {
                icon: Phone, label: 'Phone Numbers',
                lines: [SCHOOL.phone, SCHOOL.phone2],
                color: 'text-emerald-600 bg-emerald-50'
              },
              {
                icon: Mail, label: 'Email Addresses',
                lines: [SCHOOL.email, SCHOOL.admissions],
                color: 'text-purple-600 bg-purple-50'
              },
              {
                icon: Clock, label: 'Office Hours',
                lines: ['Monday – Friday: 7:30 AM – 4:00 PM', 'Saturday: 9:00 AM – 12:00 PM (Admissions only)'],
                color: 'text-orange-600 bg-orange-50'
              },
            ].map(({ icon: Icon, label, lines, color }) => (
              <div key={label} className="flex gap-4 items-start">
                <div className={`p-3 rounded-xl ${color} shrink-0`}>
                  <Icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-slate-800 text-sm">{label}</p>
                  {lines.map((l) => (
                    <p key={l} className="text-slate-500 text-sm">{l}</p>
                  ))}
                </div>
              </div>
            ))}

            {/* Social */}
            <div className="flex gap-3 pt-2">
              {[
                { name: 'Facebook', svg: <path d="M18 2h-3a5 5 0 0 0-5 5v3H7v4h3v8h4v-8h3l1-4h-4V7a1 1 0 0 1 1-1h3z" /> },
                { name: 'Twitter', svg: <path d="M22 4s-.7 2.1-2 3.4c1.6 10-9.4 17.3-18 11.6 2.2.1 4.4-.6 6-2C3 15.5.5 9.6 3 5c2.2 2.6 5.6 4.1 9 4-.9-4.2 4-6.6 7-3.8 1.1 0 3-1.2 3-1.2z" /> },
                { name: 'YouTube', svg: <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33A2.78 2.78 0 0 0 3.4 19c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.25 29 29 0 0 0-.46-5.33z" /> },
                { name: 'Instagram', svg: <g><rect width="20" height="20" x="2" y="2" rx="5" ry="5" /><path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" /><line x1="17.5" x2="17.51" y1="6.5" y2="6.5" /></g> }
              ].map((item, i) => (
                <a key={i} href="#" aria-label={item.name}
                  className="bg-white border border-slate-200 hover:bg-blue-700 hover:border-blue-700 hover:text-white text-slate-500 p-2.5 rounded-xl transition">
                  <svg className="h-4 w-4 fill-none stroke-current" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
                    {item.svg}
                  </svg>
                </a>
              ))}
            </div>
          </div>

          {/* Quick enquiry form */}
          <form className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 space-y-5"
            onSubmit={(e) => { e.preventDefault(); alert('Thank you! We will get back to you shortly.'); }}>
            <h3 className="text-lg font-bold text-slate-800">Send Us a Message</h3>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Full Name</label>
                <input type="text" placeholder="e.g. John Adeyemi" required
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 block mb-1">Phone Number</label>
                <input type="tel" placeholder="+234 8XX XXX XXXX"
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Email Address</label>
              <input type="email" placeholder="your@email.com" required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Subject</label>
              <select className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>Admissions Enquiry</option>
                <option>Fee Payment</option>
                <option>Academic Records</option>
                <option>General Information</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold text-slate-600 block mb-1">Message</label>
              <textarea rows={4} placeholder="Write your message here..." required
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none" />
            </div>
            <button type="submit"
              className="w-full bg-blue-700 hover:bg-blue-800 text-white font-semibold py-3 rounded-lg text-sm transition">
              Send Message
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

// ─── Footer ──────────────────────────────────────────────────────────────────
function Footer() {
  return (
    <footer className="bg-blue-950 text-blue-200">
      <div className="max-w-7xl mx-auto px-6 py-14 grid md:grid-cols-4 gap-10">
        {/* Brand */}
        <div className="md:col-span-2">
          <div className="flex items-center gap-3 mb-4">
            <div className="bg-blue-700 rounded-full p-2">
              <GraduationCap className="h-6 w-6 text-white" />
            </div>
            <p className="font-extrabold text-white text-base">{SCHOOL.name}</p>
          </div>
          <p className="text-sm leading-relaxed mb-4">{SCHOOL.tagline}</p>
          <p className="text-xs text-blue-400">{SCHOOL.motto}</p>
          <p className="text-xs text-blue-400 mt-2">Established {SCHOOL.established} · Lagos, Nigeria</p>
        </div>

        {/* Links */}
        <div>
          <h4 className="text-white font-semibold text-sm mb-4">Quick Links</h4>
          <ul className="space-y-2 text-sm">
            {['About', 'Academics', 'Admissions', 'News', 'Contact'].map((l) => (
              <li key={l}>
                <a href={`#${l.toLowerCase()}`} className="hover:text-white transition">{l}</a>
              </li>
            ))}
            <li>
              <Link to="/login" className="hover:text-white transition">Student & Parent Portal</Link>
            </li>
            <li>
              <Link to="/register" className="hover:text-white transition">Student & Parent Registration</Link>
            </li>
            <li className="pt-2 border-t border-blue-900/60">
              <Link to="/teacher-login" className="hover:text-yellow-300 text-blue-300 text-xs transition">Teacher & Staff Portal →</Link>
            </li>
            <li>
              <Link to="/admin-login" className="hover:text-yellow-300 text-blue-300 text-xs transition">Admin Console Access →</Link>
            </li>
          </ul>
        </div>

        {/* Contact summary */}
        <div>
          <h4 className="text-white font-semibold text-sm mb-4">Contact</h4>
          <ul className="space-y-3 text-sm">
            <li className="flex gap-2 items-start"><MapPin className="h-4 w-4 shrink-0 mt-0.5 text-blue-400" />{SCHOOL.address}</li>
            <li className="flex gap-2 items-center"><Phone className="h-4 w-4 text-blue-400" />{SCHOOL.phone}</li>
            <li className="flex gap-2 items-center"><Mail className="h-4 w-4 text-blue-400" />{SCHOOL.email}</li>
          </ul>
        </div>
      </div>

      <div className="border-t border-blue-900 py-5 px-6 text-center text-xs text-blue-500">
        © {new Date().getFullYear()} {SCHOOL.name}. All rights reserved. &nbsp;|&nbsp; Powered by Pinnacle HMS
      </div>
    </footer>
  );
}

// ─── Main Export ─────────────────────────────────────────────────────────────
export default function LandingPage() {
  return (
    <div className="font-sans antialiased">
      <Navbar />
      <Hero />
      <About />
      <Academics />
      <Admissions />
      <News />
      <Contact />
      <Footer />
    </div>
  );
}
