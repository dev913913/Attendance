export default function Home() {
  return (
    <main className="min-h-screen bg-slate-50 px-6 py-20 text-slate-900 sm:px-10">
      <section className="mx-auto max-w-2xl rounded-2xl border border-slate-200 bg-white p-8 shadow-sm sm:p-12">
        <p className="text-sm font-semibold tracking-[0.16em] text-indigo-700 uppercase">KMS College of IT and Management</p>
        <h1 className="mt-4 text-4xl font-bold tracking-tight sm:text-5xl">Attendance, ready for class.</h1>
        <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600">
          The teacher-controlled attendance workspace is being prepared for the combined English class: B.Sc. FD 1, B.Com 1, and BBA 1.
        </p>
        <div className="mt-8 rounded-xl bg-indigo-50 p-5 text-sm leading-6 text-indigo-950">
          <strong>Foundation complete.</strong> Student import, class marking, and the attendance register will be added in later phases.
        </div>
      </section>
    </main>
  );
}
