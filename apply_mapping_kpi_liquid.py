with open('index.html', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. Add CSS for .lgl-slate and .lgl-indigo
css_anchor = '/* Color accents for SJA 3 (Sky) */'
new_css = '''        /* Color accents for Slate / Silver (Total Kapasitas Rak) */
        html:not(.dark) .lgl-slate {
            border-bottom-color: rgba(148, 163, 184, 0.5) !important;
        }
        html:not(.dark) .lgl-slate:hover {
            box-shadow: 
                inset 0 1.5px 2px 0 rgba(255, 255, 255, 0.95),
                0 14px 30px -4px rgba(100, 116, 139, 0.18),
                0 0 20px rgba(148, 163, 184, 0.18) !important;
            border-color: rgba(148, 163, 184, 0.45) !important;
        }
        html.dark .lgl-slate {
            border-bottom-color: rgba(148, 163, 184, 0.35) !important;
        }
        html.dark .lgl-slate:hover {
            box-shadow: 
                inset 0 1.5px 2px 0 rgba(255, 255, 255, 0.25),
                0 14px 32px -4px rgba(15, 23, 42, 0.5),
                0 0 25px rgba(148, 163, 184, 0.2) !important;
            border-color: rgba(148, 163, 184, 0.5) !important;
        }

        /* Color accents for Indigo / Purple (Total Stok Sistem) */
        html:not(.dark) .lgl-indigo {
            border-bottom-color: rgba(99, 102, 241, 0.5) !important;
        }
        html:not(.dark) .lgl-indigo:hover {
            box-shadow: 
                inset 0 1.5px 2px 0 rgba(255, 255, 255, 0.95),
                0 14px 30px -4px rgba(79, 70, 229, 0.2),
                0 0 20px rgba(99, 102, 241, 0.2) !important;
            border-color: rgba(99, 102, 241, 0.45) !important;
        }
        html.dark .lgl-indigo {
            border-bottom-color: rgba(129, 140, 248, 0.4) !important;
        }
        html.dark .lgl-indigo:hover {
            box-shadow: 
                inset 0 1.5px 2px 0 rgba(255, 255, 255, 0.25),
                0 14px 32px -4px rgba(67, 56, 202, 0.45),
                0 0 25px rgba(129, 140, 248, 0.25) !important;
            border-color: rgba(129, 140, 248, 0.5) !important;
        }

        /* Color accents for SJA 3 (Sky) */'''

# 2. Update the HTML for the 5 KPI Cards in Mapping Gudang SJA3
old_mapping_kpi = '''                <!-- KPI Metric Cards Gudang SJA3 -->
                <div class="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
                    <!-- Total Kapasitas Slot -->
                    <div class="bg-gradient-to-br from-slate-50 to-slate-100/60 dark:from-slate-800/80 dark:to-slate-900 border border-slate-200 dark:border-slate-700/80 p-4 rounded-2xl shadow-2xs">
                        <div class="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-1">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Total Kapasitas Rak</span>
                            <i class="ph ph-squares-four text-base text-slate-600 dark:text-slate-300"></i>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-slate-800 dark:text-slate-100" id="map-stat-total-slots">352</div>
                        <div class="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-1">
                            <span class="font-bold text-slate-700 dark:text-slate-300">16 Area BIN</span> (BIN 2 s/d 17)
                        </div>
                    </div>

                    <!-- Slot Terisi (Biru Muda) -->
                    <div class="bg-gradient-to-br from-sky-50/70 to-sky-100/50 dark:from-sky-950/40 dark:to-slate-900 border border-sky-200 dark:border-sky-800/60 p-4 rounded-2xl shadow-2xs">
                        <div class="flex items-center justify-between text-sky-700 dark:text-sky-400 mb-1">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Slot Terisi (Biru Muda)</span>
                            <span class="w-3.5 h-3.5 rounded bg-[#93C5FD] border border-[#0284C7] shadow-xs"></span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-sky-800 dark:text-sky-200" id="map-stat-occupied-slots">74</div>
                        <div class="text-[11px] text-sky-700 dark:text-sky-400 mt-1 font-semibold flex items-center gap-1" id="map-stat-occupancy-rate">
                            21,0% Okupansi Gudang
                        </div>
                    </div>

                    <!-- Slot Kosong (Kuning) - Tetap Kuning di Mode Terang Maupun Gelap -->
                    <div class="bg-gradient-to-br from-amber-50 to-amber-100/70 dark:from-amber-400/25 dark:to-amber-500/15 border-2 border-amber-300 dark:border-amber-400/60 p-4 rounded-2xl shadow-2xs">
                        <div class="flex items-center justify-between text-amber-800 dark:text-amber-300 mb-1">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Slot Kosong (Kuning)</span>
                            <span class="w-3.5 h-3.5 rounded bg-[#F6E2A3] border border-[#D4B968] shadow-xs"></span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-amber-900 dark:text-amber-300" id="map-stat-empty-slots">278</div>
                        <div class="text-[11px] text-amber-800 dark:text-amber-300 mt-1 font-semibold flex items-center gap-1" id="map-stat-empty-rate">
                            79,0% Siap Ditempati
                        </div>
                    </div>

                    <!-- Total Sak Kopi Tersedia -->
                    <div class="bg-gradient-to-br from-emerald-50/70 to-emerald-100/40 dark:from-emerald-950/40 dark:to-slate-900 border border-emerald-200 dark:border-emerald-800/60 p-4 rounded-2xl shadow-2xs">
                        <div class="flex items-center justify-between text-emerald-700 dark:text-emerald-400 mb-1">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Total Karung (Sak)</span>
                            <i class="ph ph-package text-base"></i>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-emerald-800 dark:text-emerald-200" id="map-stat-total-sak">2.475</div>
                        <div class="text-[11px] text-emerald-700 dark:text-emerald-400 mt-1 truncate">
                            Sisa Sak Aktif SJA3
                        </div>
                    </div>

                    <!-- Total Berat Netto (Kg) -->
                    <div class="bg-gradient-to-br from-indigo-50/70 to-indigo-100/40 dark:from-indigo-950/40 dark:to-slate-900 border border-indigo-200 dark:border-indigo-800/60 p-4 rounded-2xl shadow-2xs">
                        <div class="flex items-center justify-between text-indigo-700 dark:text-indigo-400 mb-1">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Total Stok Sistem (Kg)</span>
                            <i class="ph ph-scales text-base"></i>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-indigo-800 dark:text-indigo-200" id="map-stat-total-kg">148.500,00</div>
                        <div class="text-[11px] text-indigo-700 dark:text-indigo-400 mt-1 truncate">
                            Netto Persediaan Kopi
                        </div>
                    </div>
                </div>'''

new_mapping_kpi = '''                <!-- KPI Metric Cards Gudang SJA3 (Model Liquid Glass Lite - Sesuai Foto) -->
                <div class="grid grid-cols-2 lg:grid-cols-5 gap-3.5 sm:gap-4">
                    <!-- 1. Total Kapasitas Slot -->
                    <div class="liquid-glass-lite-card lgl-slate p-4 rounded-2xl flex flex-col justify-between group cursor-default">
                        <div class="flex items-center justify-between text-slate-600 dark:text-slate-300 mb-1 relative z-10">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Total Kapasitas Rak</span>
                            <div class="w-8 h-8 rounded-lg bg-slate-500/10 dark:bg-slate-400/20 text-slate-600 dark:text-slate-300 border border-slate-300/80 dark:border-slate-500/40 flex items-center justify-center text-sm shadow-2xs">
                                <i class="ph ph-squares-four"></i>
                            </div>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-slate-800 dark:text-slate-100 tracking-tight my-1 relative z-10" id="map-stat-total-slots">358</div>
                        <div class="text-[11px] text-slate-600 dark:text-slate-400 mt-1 flex items-center gap-1 relative z-10">
                            <span class="font-bold text-slate-800 dark:text-slate-200">16 Area BIN</span> (BIN 2 s/d 17)
                        </div>
                    </div>

                    <!-- 2. Slot Terisi (Biru Muda) -->
                    <div class="liquid-glass-lite-card lgl-sky p-4 rounded-2xl flex flex-col justify-between group cursor-default">
                        <div class="flex items-center justify-between text-sky-800 dark:text-sky-300 mb-1 relative z-10">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Slot Terisi (Biru Muda)</span>
                            <span class="w-4 h-4 rounded-md bg-[#93C5FD] border border-[#0284C7] shadow-xs"></span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-sky-900 dark:text-sky-200 tracking-tight my-1 relative z-10" id="map-stat-occupied-slots">344</div>
                        <div class="text-[11px] text-sky-800 dark:text-sky-300 mt-1 font-semibold flex items-center gap-1 relative z-10" id="map-stat-occupancy-rate">
                            96,1% Okupansi Gudang
                        </div>
                    </div>

                    <!-- 3. Slot Kosong (Kuning) -->
                    <div class="liquid-glass-lite-card lgl-amber p-4 rounded-2xl flex flex-col justify-between group cursor-default">
                        <div class="flex items-center justify-between text-amber-800 dark:text-amber-300 mb-1 relative z-10">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Slot Kosong (Kuning)</span>
                            <span class="w-4 h-4 rounded-md bg-[#F6E2A3] border border-[#D4B968] shadow-xs"></span>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-amber-900 dark:text-amber-200 tracking-tight my-1 relative z-10" id="map-stat-empty-slots">14</div>
                        <div class="text-[11px] text-amber-800 dark:text-amber-300 mt-1 font-semibold flex items-center gap-1 relative z-10" id="map-stat-empty-rate">
                            3,9% Siap Ditempati
                        </div>
                    </div>

                    <!-- 4. Total Sak Kopi Tersedia -->
                    <div class="liquid-glass-lite-card lgl-emerald p-4 rounded-2xl flex flex-col justify-between group cursor-default">
                        <div class="flex items-center justify-between text-emerald-800 dark:text-emerald-300 mb-1 relative z-10">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Total Karung (Sak)</span>
                            <div class="w-8 h-8 rounded-lg bg-emerald-500/10 dark:bg-emerald-400/20 text-emerald-600 dark:text-emerald-300 border border-emerald-300/80 dark:border-emerald-500/40 flex items-center justify-center text-sm shadow-2xs">
                                <i class="ph ph-package"></i>
                            </div>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-emerald-900 dark:text-emerald-200 tracking-tight my-1 relative z-10" id="map-stat-total-sak">72.926</div>
                        <div class="text-[11px] text-emerald-800 dark:text-emerald-300 mt-1 truncate relative z-10">
                            Sisa Sak Aktif SJA3
                        </div>
                    </div>

                    <!-- 5. Total Berat Netto (Kg) -->
                    <div class="liquid-glass-lite-card lgl-indigo p-4 rounded-2xl flex flex-col justify-between group cursor-default">
                        <div class="flex items-center justify-between text-indigo-800 dark:text-indigo-300 mb-1 relative z-10">
                            <span class="text-[11px] font-bold uppercase tracking-wider">Total Stok Sistem (Kg)</span>
                            <div class="w-8 h-8 rounded-lg bg-indigo-500/10 dark:bg-indigo-400/20 text-indigo-600 dark:text-indigo-300 border border-indigo-300/80 dark:border-indigo-500/40 flex items-center justify-center text-sm shadow-2xs">
                                <i class="ph ph-scales"></i>
                            </div>
                        </div>
                        <div class="text-2xl sm:text-3xl font-black font-mono text-indigo-900 dark:text-indigo-200 tracking-tight my-1 relative z-10" id="map-stat-total-kg">5.984.217,57</div>
                        <div class="text-[11px] text-indigo-800 dark:text-indigo-300 mt-1 truncate relative z-10">
                            Netto Persediaan Kopi
                        </div>
                    </div>
                </div>'''

modified = 0
if css_anchor in content:
    content = content.replace(css_anchor, new_css, 1)
    modified += 1
    print('1. CSS lgl-slate and lgl-indigo added')
else:
    print('1. CSS anchor not found')

if old_mapping_kpi in content:
    content = content.replace(old_mapping_kpi, new_mapping_kpi, 1)
    modified += 1
    print('2. HTML Mapping KPI cards updated to Liquid Glass Lite')
else:
    print('2. HTML Mapping KPI cards not found')

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(content)

print(f'Total modifications: {modified}')
