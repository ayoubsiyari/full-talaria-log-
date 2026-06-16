      <SessionDateCalendar
        open={newSessCalOpen}
        pos={newSessCalPos}
        label={newSessCalTarget === "start" ? "Start date" : "End date"}
        minIso={calMinIso}
        maxIso={calMaxIso}
        valueIso={newSessCalTarget === "start" ? newSessStart : newSessEnd}
        viewY={newSessCalViewY}
        viewM={newSessCalViewM}
        mode={newSessCalMode}
        yearBase={newSessCalYearBase}
        onViewY={setNewSessCalViewY}
        onViewM={setNewSessCalViewM}
        onMode={setNewSessCalMode}
        onYearBase={setNewSessCalYearBase}
        onSelect={handleSessCalSelect}
        onClose={() => { setNewSessCalOpen(false); setNewSessCalMode("days"); }}
        colors={c}
        fontFamily={F}
        IconClose={({ s, cl }) => <I n="x" s={s} cl={cl} />}
      />
      <style>{`
        @keyframes tlrPopIn {
          from { opacity: 0; transform: scale(0.98); }
          to { opacity: 1; transform: scale(1); }
        }
      `}</style>
    </>
  );
}
