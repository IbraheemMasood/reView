// Ghidra Call Graph Exporter for Educational Visualizer
//@category Analysis
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.FunctionManager;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.mem.MemoryBlock;
import ghidra.program.model.symbol.Reference;
import ghidra.util.task.ConsoleTaskMonitor;
 
import java.io.File;
import java.io.PrintWriter;
import java.util.*;
 
public class ExportGraph extends GhidraScript {
 
    // Hide compiler/CRT boilerplate and PLT0 so the demo graph stays readable
    private static final boolean HIDE_CRT = true;
    private static final Set<String> CRT_NAMES = new HashSet<>(Arrays.asList(
        "_init", "_fini", "deregister_tm_clones", "register_tm_clones",
        "__do_global_dtors_aux", "frame_dummy"));
 
    private FunctionManager funcMgr;
 
    @Override
    public void run() throws Exception {
        funcMgr = currentProgram.getFunctionManager();
 
        DecompInterface decompiler = new DecompInterface();
        decompiler.openProgram(currentProgram);
        ConsoleTaskMonitor tm = new ConsoleTaskMonitor();
 
        Map<String, Function> nodes = new LinkedHashMap<>();
        List<String[]> edges = new ArrayList<>();
        Set<String> seenEdges = new HashSet<>();
 
        // Pass 1: decide which functions become nodes
        FunctionIterator it = funcMgr.getFunctions(true);
        List<Function> kept = new ArrayList<>();
        while (it.hasNext() && !monitor.isCancelled()) {
            Function f = it.next();
            if (shouldSkip(f)) continue;
            kept.add(f);
            nodes.put(addr(f), f);
        }
 
        // Pass 2: edges from calls, jumps (tail calls) AND data refs (e.g. _start -> main)
        for (Function f : kept) {
            String src = addr(f);
            Set<Function> targets = new LinkedHashSet<>(f.getCalledFunctions(tm));
 
            InstructionIterator ins = currentProgram.getListing().getInstructions(f.getBody(), true);
            while (ins.hasNext()) {
                Instruction i = ins.next();
                for (Reference ref : i.getReferencesFrom()) {
                    if (!(ref.getReferenceType().isCall()
                       || ref.getReferenceType().isJump()
                       || ref.getReferenceType().isData())) continue;
                    Address to = ref.getToAddress();
                    Function tf = funcMgr.getFunctionAt(to);
                    if (tf == null) tf = funcMgr.getReferencedFunction(to);
                    if (tf != null) targets.add(tf);
                }
            }
 
            for (Function t : targets) {
                Function c = canonical(t);          // PLT stub -> real import
                if (shouldSkip(c) && c == t) continue;
                String dst = addr(c);
                if (dst.equals(src)) continue;
                String key = src + "->" + dst;
                if (!seenEdges.add(key)) continue;
                nodes.putIfAbsent(dst, c);
                edges.add(new String[] { src, dst });
            }
        }
 
        // Drop import nodes nothing points at (e.g. __gmon_start__ once CRT is hidden)
        Set<String> hasIncoming = new HashSet<>();
        for (String[] e : edges) hasIncoming.add(e[1]);
        nodes.entrySet().removeIf(en ->
            isImport(en.getValue()) && !hasIncoming.contains(en.getKey()));
 
        // Emit JSON
        StringBuilder nj = new StringBuilder();
        int n = 0;
        for (Map.Entry<String, Function> en : nodes.entrySet()) {
            Function f = en.getValue();
            String code;
            if (isImport(f)) {
                code = "// Imported function\n" + f.getPrototypeString(false, false) + ";";
            } else {
                code = "// Decompilation unavailable";
                DecompileResults r = decompiler.decompileFunction(f, 30, tm);
                if (r != null && r.decompileCompleted()) {
                    code = r.getDecompiledFunction().getC().trim();
                }
            }
            String name = f.getName();
            String type = isImport(f) ? "import"
                        : (name.equalsIgnoreCase("main") || name.equalsIgnoreCase("_start")) ? "entry"
                        : "custom";
            if (n++ > 0) nj.append(",\n");
            nj.append("    {\n")
              .append("      \"id\": \"").append(esc(en.getKey())).append("\",\n")
              .append("      \"label\": \"").append(esc(name)).append("\",\n")
              .append("      \"type\": \"").append(type).append("\",\n")
              .append("      \"summary\": \"Click on nodes to inspect execution pathways.\",\n")
              .append("      \"decompiled\": \"").append(esc(code)).append("\"\n")
              .append("    }");
        }
 
        StringBuilder ej = new StringBuilder();
        int m = 0;
        for (String[] e : edges) {
            if (!nodes.containsKey(e[0]) || !nodes.containsKey(e[1])) continue;
            if (m++ > 0) ej.append(",\n");
            ej.append("    {\n")
              .append("      \"source\": \"").append(esc(e[0])).append("\",\n")
              .append("      \"target\": \"").append(esc(e[1])).append("\"\n")
              .append("    }");
        }
 
        String json = "{\n  \"nodes\": [\n" + nj + "\n  ],\n  \"edges\": [\n" + ej + "\n  ]\n}\n";
 
        File dest = askFile("Save Exported Graph JSON", "Save");
        String path = dest.getAbsolutePath();
        if (!path.toLowerCase().endsWith(".json")) path += ".json";
        try (PrintWriter w = new PrintWriter(path, "UTF-8")) { w.print(json); }
 
        println("[+] Graph Export Complete: " + n + " nodes, " + m + " edges.");
    }
 
    private String addr(Function f) { return "0x" + f.getEntryPoint().toString(); }
 
    private String blockName(Function f) {
        MemoryBlock b = currentProgram.getMemory().getBlock(f.getEntryPoint());
        return b == null ? "" : b.getName();
    }
 
    // Real import: external-space function or one in Ghidra's EXTERNAL block
    private boolean isImport(Function f) {
        return f.isExternal() || blockName(f).equals("EXTERNAL");
    }
 
    // Collapse PLT thunks that resolve to an import; leave other thunks (frame_dummy) alone
    private Function canonical(Function f) {
        if (f.isThunk()) {
            Function t = f.getThunkedFunction(true);
            if (t != null && t != f && isImport(t)) return t;
        }
        return f;
    }
 
    private boolean shouldSkip(Function f) {
        if (canonical(f) != f) return true;                       // PLT stub, replaced by import node
        if (blockName(f).startsWith(".plt") && !isImport(f)) return true; // PLT0 / unresolved stubs
        return HIDE_CRT && CRT_NAMES.contains(f.getName());
    }
 
    private String esc(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':  sb.append("\\\""); break;
                case '\\': sb.append("\\\\"); break;
                case '\b': sb.append("\\b"); break;
                case '\f': sb.append("\\f"); break;
                case '\n': sb.append("\\n"); break;
                case '\r': sb.append("\\r"); break;
                case '\t': sb.append("\\t"); break;
                default:
                    if (c < ' ') sb.append(String.format("\\u%04x", (int) c));
                    else sb.append(c);
            }
        }
        return sb.toString();
    }
}
 

