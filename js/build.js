// The app's build number and "what's new". Every release: n + 1 (and VERSION in sw.js), and a short line in NOTES.
// version.json { "min": N } on the server forces every copy older than N to refresh at once (for a serious bug).
window.BUILD = {
  n: 11,
  notes: [
    { n: 11, text: "שיפורי אמינות: סנכרון בטוח יותר בין מכשירים, עבודה טובה יותר באייפון ובקליטה חלשה" },
    { n: 10, text: "הודעת שגיאה מפורטת בחיבור ל-Dropbox" },
    { n: 8, text: "חדש: סנכרון אוטומטי בין הטלפון למחשב דרך Dropbox (בהגדרות, ב״גיבוי וסנכרון״)." },
    { n: 7, text: "חדש: כרטיס צעדים ראשונים שמוביל אותך בהתחלה, ועמוד עזרה בהגדרות." },
    { n: 6, text: 'האפליקציה מתעדכנת עכשיו לבד, ברגע שלא עורכים כלום, בלי לאבד נתונים. לפני כל עדכון נשמר עותק במכשיר.' }
  ]
};
