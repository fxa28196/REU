package websim.exporter.closures;

import java.lang.reflect.Constructor;
import java.lang.reflect.Field;
import java.lang.reflect.Method;

/**
 * WP8 glue: reflective access to the certified {@code geography.*} classes.
 *
 * <p>Identical in spirit and rules to {@code websim.exporter.world.Reflect}
 * (which is package-private, hence this copy). Reflection is used ONLY to reach
 * production constants, package-private constructors and private state that
 * already owns the logic. <b>No value produced through this class is computed
 * here.</b>
 */
final class CReflect {

	private CReflect() { }

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

	static Constructor<?> declaredCtor(Class<?> c, Class<?>... params) throws Exception {
		Constructor<?> k = c.getDeclaredConstructor(params);
		k.setAccessible(true);
		return k;
	}
}
