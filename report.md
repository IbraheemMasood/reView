# reView pipeline test report

| program | nodes/edges | secs | runs |
|---|---|---|---|
| basic_o0 | 13/13 | 14.8 | PASS args: hello, PASS args: nope, PASS stdin: hello |
| basic_o2 | 13/13 | 14.8 | PASS args: hello, PASS args: nope, PASS stdin: hello |
| basic_nopie | 15/13 | 14.9 | PASS args: hello, PASS args: nope, PASS stdin: hello |
| basic_stripped | 23/19 | 13.8 | PASS args: hello, PASS args: nope, PASS stdin: hello |
| basic_static | 1168/2685 | 147.1 | FAIL args: hello, FAIL args: nope, FAIL stdin: hello |
| recursion | 6/5 | 14.6 | PASS no arguments |
| funcptr | 9/7 | 14.5 | PASS no arguments |
| loop_calls | 5/4 | 14.1 | PASS no arguments |
| threads | 9/8 | 14.5 | WARN no arguments |
| cpp_hello | 50/59 | 18.7 | FAIL no arguments |
| crash | 6/5 | 14.5 | PASS no arguments |
| spin | 5/4 | 23.9 | PASS no arguments |

## Details (anything that is not a clean PASS)

- `basic_o0` [info] args: hello: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `basic_o0` [info] args: nope: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `basic_o0` [info] stdin: hello: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `basic_o2` [info] args: hello: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `basic_o2` [info] args: nope: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `basic_o2` [info] stdin: hello: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `basic_nopie` [info] args: hello: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `basic_nopie` [info] args: nope: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `basic_nopie` [info] stdin: hello: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `basic_stripped` [info] args: hello: 5 call(s) not in the static graph, e.g. __libc_start_main -> FUN_0010120b
- `basic_stripped` [info] args: nope: 5 call(s) not in the static graph, e.g. __libc_start_main -> FUN_0010120b
- `basic_stripped` [info] stdin: hello: 5 call(s) not in the static graph, e.g. __libc_start_main -> FUN_0010120b
- `basic_static` [FAIL] args: hello: trace ended badly: TRACE STOPPED: gdb error: The program is not being run.
- `basic_static` [FAIL] args: hello: never reached any program function (only libc / startup)
- `basic_static` [FAIL] args: hello: missing calls: check, ok
- `basic_static` [FAIL] args: nope: trace ended badly: TRACE STOPPED: gdb error: The program is not being run.
- `basic_static` [FAIL] args: nope: never reached any program function (only libc / startup)
- `basic_static` [FAIL] args: nope: missing calls: check, bad
- `basic_static` [FAIL] stdin: hello: trace ended badly: TRACE STOPPED: gdb error: The program is not being run.
- `basic_static` [FAIL] stdin: hello: never reached any program function (only libc / startup)
- `basic_static` [FAIL] stdin: hello: missing calls: check, ok
- `recursion` [info] no arguments: trace cut off (TRACE CUT OFF after 300 events)
- `recursion` [info] no arguments: 3 call(s) not in the static graph, e.g. __libc_start_main -> main
- `funcptr` [info] no arguments: 4 call(s) not in the static graph, e.g. __libc_start_main -> main
- `loop_calls` [info] no arguments: trace cut off (TRACE CUT OFF after 300 events)
- `loop_calls` [info] no arguments: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `threads` [WARN] no arguments: 4 abnormal return(s) (tail call / longjmp / threads?)
- `threads` [info] no arguments: 9 call(s) not in the static graph, e.g. __libc_start_main -> main
- `cpp_hello` [FAIL] no arguments: trace ended badly: CRASHED (SIGSEGV)
- `cpp_hello` [info] no arguments: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `crash` [info] no arguments: 1 call(s) not in the static graph, e.g. __libc_start_main -> main
- `spin` [info] no arguments: failed as expected: timed out after 10s (waiting for input? infinite loop?)
