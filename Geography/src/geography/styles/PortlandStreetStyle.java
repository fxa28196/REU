package geography.styles;

import gov.nasa.worldwind.render.SurfacePolyline;
import gov.nasa.worldwind.render.SurfaceShape;

import java.awt.Color;

import geography.agents.PortlandStreet;
import repast.simphony.visualization.gis3D.style.SurfaceShapeStyle;

/**
 * Style for PortlandStreets.
 * 
 * @author Eric Tatara
 *
 */
public class PortlandStreetStyle implements SurfaceShapeStyle<PortlandStreet>{

	@Override
	public SurfaceShape getSurfaceShape(PortlandStreet object, SurfaceShape shape) {
	  return new SurfacePolyline();
	}

	@Override
	public Color getFillColor(PortlandStreet obj) {
		return null;
	}

	@Override
	public double getFillOpacity(PortlandStreet obj) {
		return 0;
	}

	@Override
	public Color getLineColor(PortlandStreet obj) {
		return Color.WHITE;
	}

	@Override
	public double getLineOpacity(PortlandStreet obj) {
		return 1.0;
	}

	@Override
	public double getLineWidth(PortlandStreet obj) {
		return 2;
	}
}