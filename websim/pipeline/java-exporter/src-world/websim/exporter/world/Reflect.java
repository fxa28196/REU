package websim.exporter.world;

import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * TASK F1 glue: reflective access to the certified {@code geography.*} classes.
 *
 * <p>Reflection is used ONLY to reach production constants and private methods
 * that already own the logic (the DR-S2 precedent). It never substitutes for
 * behaviour: no value produced through this class is computed here.
 */
final class Reflect {

	private Reflect() { }

	static Field declared(Class<?> c, String name) throws Exception {
		Field f = c.getDeclaredField(name);
		f.setAccessible(true);
		return f;
	}

	static Object staticField(Class<?> c, String name) throws Exception {
		return declared(c, name).get(null);
	}

	static Object instanceField(Object o, Class<?> c, String name) throws Exception {
		return declared(c, name).get(o);
	}

	static Method declaredMethod(Class<?> c, String name, Class<?>... params) throws Exception {
		Method m = c.getDeclaredMethod(name, params);
		m.setAccessible(true);
		return m;
	}
}
