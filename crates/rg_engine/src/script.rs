// SPDX-License-Identifier: AGPL-3.0-or-later
//! The game script: a CErXes engine that has run the runtime (js/runtime.js),
//! the game's modules and its entry file.

use cerxes::value::Val;

pub const RUNTIME: &str = include_str!("js/runtime.js");

pub struct Script {
    pub vm: cerxes::Engine,
}

impl Script {
    pub fn new() -> Script {
        let mut vm = cerxes::Engine::new();
        // the register machine, as the CErXes playground runs games
        vm.vm.regs = true;
        Script { vm }
    }

    /// Runs a script; Err with the error text when it does not parse or throws.
    pub fn eval(&mut self, src: &str, path: &str) -> Result<String, String> {
        self.vm.set_syntax_for_path(path);
        let r = self.vm.eval(src);
        self.vm.set_syntax(true, true);
        if !self.vm.error.is_empty() {
            let e = self.vm.error.clone();
            self.vm.error = String::new();
            return Err(format!("{}: {}", path, e));
        }
        Ok(r)
    }

    /// Calls the global function `name` with one string argument and answers
    /// what it returns as a string; a call compiles nothing.
    pub fn call(&mut self, name: &str, arg: String) -> Result<String, String> {
        let engine = &mut self.vm;
        engine.error = String::new();
        let a = engine.vm.intern(name);
        let g = engine.vm.global;
        let f = engine.vm.get_obj(g, a, &Val::Obj(g));
        if !engine.vm.is_callable(&f) {
            return Err(format!("{} is not a function", name));
        }
        let av = engine.vm.string_val(arg);
        let r = engine.vm.call_top(f, Val::Undef, vec![av]);
        if engine.vm.throwing {
            let exc = engine.vm.exc.clone();
            engine.vm.throwing = false;
            engine.vm.exc = Val::Undef;
            engine.vm.stack.clear();
            engine.vm.frames.clear();
            engine.vm.handlers.clear();
            engine.vm.native_depth = 0;
            let s = engine.vm.display(&exc);
            return Err(format!("Uncaught {}", s));
        }
        engine.vm.temp_roots.push(r.clone());
        engine.vm.run_jobs();
        engine.vm.temp_roots.pop();
        Ok(match &r {
            Val::Str(s) => engine.vm.sref(*s).to_string(),
            _ => engine.vm.display(&r),
        })
    }

    /// What console.log printed since the last call, one entry a line.
    pub fn take_output(&mut self) -> Vec<String> {
        let mut out = Vec::new();
        let n = self.vm.output_count();
        for i in 0..n {
            out.push(self.vm.output_at(i));
        }
        self.vm.clear_output();
        out
    }
}
