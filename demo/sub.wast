(module
   (func $func1 (param i32) (result i32)
     (call_import $import1 (i32.add (i32.const 1) (get_local 0)))
   )
   (export "plusOne" $func1)
   (import $import1 "env" "callback" (param i32) (result i32))
   (memory 0 10)
)
