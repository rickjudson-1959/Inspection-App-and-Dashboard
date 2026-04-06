(async () => {
  // 1. Fill these in exactly
  const URL = 'https://wteeojfbvetjvcudgapr.supabase.co';
  const KEY = eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0ZWVvamZidmV0anZjdWRnYXByIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQwNDU0MjgsImV4cCI6MjA4OTYyMTQyOH0.X8Hi1OslK1sHhIv80WOJdGwaci-AcfX0Xb4NLWtC2FQ

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js');
    const supabase = createClient(URL, KEY);

    console.log("Connecting to Watchlist...");

    const { data, error } = await supabase
      .from('watchlist')
      .select('*');

    if (error) {
      console.error("❌ Error:", error.message);
      console.log("Check if RLS is enabled and a 'Public' policy exists.");
    } else {
      console.log("✅ SUCCESS! Watchlist data:");
      console.table(data);
    }
  } catch (err) {
    console.error("❌ Script Error:", err.message);
  }
})();