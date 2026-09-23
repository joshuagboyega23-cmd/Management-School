import React, { useState, useEffect } from 'react';
import {
  GraduationCap, BookOpen, Users, Trophy, Phone, Mail, MapPin,
  ChevronRight, Star, Shield, Globe, Clock, ArrowRight, Menu, X,
  Award, Target, Heart, Link
} from 'lucide-react';

// ─── School Configuration ─────────────────────────────────────────────────────
const SCHOOL = {
  name: 'Pinnacle Heights Academy',
  tagline: 'Nurturing Excellence, Building Futures',
  motto: '"Knowledge · Character · Service"',
  established: 1998,
  address: '14 Excellence Boulevard, Lekki Phase 1, Lagos State, Nigeria',
  phone: '+234 (0) 801 234 5678',
  phone2: '+234 (0) 901 234 5678',
  email: 'info@pinnacleheights.edu.ng',
  admissions: 'admissions@pinnacleheights.edu.ng',
  principalName: 'Mrs. Adaora Nwosu, M.Ed.',
  accreditation: 'Fully accredited by WAEC · NECO · Lagos State Ministry of Education',
};

const STATS = [
  { value: '2,400+', label: 'Enrolled Students', icon: Users },
  { value: '98%', label: 'WAEC Pass Rate', icon: Trophy },
  { value: '120+', label: 'Qualified Staff', icon: Star },
  { value: '26', label: 'Years of Excellence', icon: Award },
];

const FEATURES = [
  {
    icon: BookOpen,
    title: 'Robust Curriculum',
    desc: 'Junior and Senior Secondary curriculum aligned with NERDC standards, offering Sciences, Arts, Commercial and Technical tracks.',
    color: 'bg-blue-50 text-blue-600',
  },
  {
    icon: Trophy,
    title: 'Award-Winning Sports',
    desc: 'State and national championships in football, athletics, basketball and table tennis. Olympians trained here.',
    color: 'bg-emerald-50 text-emerald-600',
  },
  {
    icon: Shield,
    title: 'Safe & Secure Campus',
    desc: '24/7 CCTV surveillance, gated compound, trained security personnel and a full-time nurse on duty every day.',
    color: 'bg-purple-50 text-purple-600',
  },
  {
    icon: Globe,
    title: 'ICT & STEM Labs',
    desc: 'Modern computer labs, robotics bay, science labs with up-to-date equipment and high-speed campus Wi-Fi.',
    color: 'bg-orange-50 text-orange-600',
  },
  {
    icon: Heart,
    title: 'Student Wellbeing',
    desc: 'Licensed school counsellors, a health bay, active peer-mentorship programmes and mental health awareness campaigns.',
    color: 'bg-rose-50 text-rose-600',
  },
  {
    icon: Target,
    title: 'Extra-Curricular Clubs',
    desc: '30+ clubs including debate, drama, press, coding, chess, Red Cross, music and cultural dance troupes.',
    color: 'bg-amber-50 text-amber-600',
  },
];

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
          <button
            onClick={onEnterPortal}
            className="bg-blue-700 hover:bg-blue-800 text-white text-sm font-semibold px-5 py-2 rounded-lg transition flex items-center gap-2"
          >
            Staff Portal <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Mobile hamburger */}
        <button className="md:hidden" onClick={() => setOpen(!open)}>
          {open ? <X className="h-6 w-6 text-slate-700" /> : <Menu className="h-6 w-6 text-slate-700" />}
        </button>
      </div>

      {/* Mobile menu */}
      {open && (
        <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 flex flex-col gap-4 shadow-lg">
          {links.map((l) => (
            <a key={l} href={`#${l.toLowerCase()}`}
              onClick={() => setOpen(false)}
              className="text-sm font-medium text-slate-700 hover:text-blue-700">
              {l}
            </a>
          ))}
          <button
            onClick={onEnterPortal}
            className="bg-blue-700 text-white text-sm font-semibold px-5 py-2 rounded-lg text-center"
          >
            Staff Portal
          </button>
        </div>
      )}
    </nav>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────
function Hero({ onEnterPortal }) {
  return (
    <section
      className="relative min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-950 via-blue-900 to-blue-800 text-white overflow-hidden"
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

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center py-32">
        <span className="inline-block bg-yellow-400/20 border border-yellow-400/40 text-yellow-300 text-xs font-semibold tracking-widest uppercase px-4 py-1.5 rounded-full mb-6">
          {SCHOOL.motto}
        </span>

        <h1 className="text-5xl md:text-7xl font-extrabold leading-tight mb-6 drop-shadow-xl">
          {SCHOOL.name}
        </h1>

        <p className="text-blue-200 text-lg md:text-xl max-w-2xl mx-auto mb-3">
          {SCHOOL.tagline}
        </p>
        <p className="text-blue-300/70 text-sm mb-10">
          Established {SCHOOL.established} &nbsp;·&nbsp; JSS1 – SS3 &nbsp;·&nbsp; Lagos, Nigeria
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <a href="#admissions"
            className="bg-yellow-400 hover:bg-yellow-300 text-blue-950 font-bold px-8 py-4 rounded-xl text-sm transition flex items-center justify-center gap-2 shadow-lg">
            Apply for Admission <ChevronRight className="h-4 w-4" />
          </a>
          <button
            onClick={onEnterPortal}
            className="bg-white/10 hover:bg-white/20 backdrop-blur border border-white/20 text-white font-semibold px-8 py-4 rounded-xl text-sm transition flex items-center justify-center gap-2">
            Staff / Admin Portal <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Stat bar */}
      <div className="absolute bottom-0 left-0 right-0 bg-blue-950/80 backdrop-blur border-t border-white/10">
        <div className="max-w-5xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-px">
          {STATS.map(({ value, label, icon: Icon }) => (
            <div key={label} className="flex flex-col items-center py-5 px-4 text-center">
              <Icon className="h-5 w-5 text-yellow-400 mb-1" />
              <span className="text-2xl font-extrabold text-white">{value}</span>
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
              {[Facebook, Twitter, Youtube, Instagram].map((Icon, i) => (
                <a key={i} href="#"
                  className="bg-white border border-slate-200 hover:bg-blue-700 hover:border-blue-700 hover:text-white text-slate-500 p-2.5 rounded-xl transition">
                  <Icon className="h-4 w-4" />
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
function Footer({ onEnterPortal }) {
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
              <button onClick={onEnterPortal} className="hover:text-white transition text-left">Staff Portal</button>
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
export default function LandingPage({ onEnterPortal }) {
  return (
    <div className="font-sans antialiased">
      <Navbar onEnterPortal={onEnterPortal} />
      <Hero onEnterPortal={onEnterPortal} />
      <About />
      <Academics />
      <Admissions />
      <News />
      <Contact />
      <Footer onEnterPortal={onEnterPortal} />
    </div>
  );
}
