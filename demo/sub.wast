(module
   (import $import1 "env" "callback" (param i32) (result i32))
   (export "plusOne" $func1)
   (memory 0 10)
   (func $func1 (param i32) (result i32)
     (call $import1 (i32.add (i32.const 1) (get_local 0)))
   )
)
