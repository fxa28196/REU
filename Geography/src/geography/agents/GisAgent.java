package geography.agents;

import org.geotools.coverage.grid.GridCoordinates2D;
import org.geotools.geometry.DirectPosition2D;
import org.opengis.geometry.DirectPosition;

import org.locationtech.jts.geom.Coordinate;

import repast.simphony.context.Context;
import repast.simphony.engine.schedule.ScheduleParameters;
import repast.simphony.engine.schedule.ScheduledMethod;
import repast.simphony.random.RandomHelper;
import repast.simphony.space.gis.Geography;
import repast.simphony.space.gis.WritableGridCoverage2D;
import repast.simphony.util.ContextUtils;

/**
 * A geolocated agent with a point location.
 * 
 * @author Eric Tatara
 *
 */
public class GisAgent {
	
	private geography.agents.Shelter targetShelter = null;
	private String name;
	private boolean water = false;
	private double waterRate;

	public GisAgent(String name) {
		this.name = name;  
	}

//	@ScheduledMethod(start = 1, interval = 1, priority = ScheduleParameters.FIRST_PRIORITY)
//	public void step() {  	
//		randomWalk();
//		
//		// The agent drinks and gets thirsy.
//		water = false;
//		waterRate = 0;
//	}
	
	private java.util.List<org.locationtech.jts.geom.Coordinate> currentPathCoords = null;
    private int currentPathIndex = 0;
    private geography.agents.PortlandStreet lastVisitedStreet = null; 

    @repast.simphony.engine.schedule.ScheduledMethod(start = 30, interval = 1)
    public void step() {
        repast.simphony.context.Context context = repast.simphony.util.ContextUtils.getContext(this);
        repast.simphony.space.gis.Geography geography = (repast.simphony.space.gis.Geography) context.getProjection("Geography");
        
        org.locationtech.jts.geom.GeometryFactory fac = new org.locationtech.jts.geom.GeometryFactory();
        org.locationtech.jts.geom.Point myPoint = (org.locationtech.jts.geom.Point) geography.getGeometry(this);
        org.locationtech.jts.geom.Coordinate myCoord = myPoint.getCoordinate();

        // Find the closest shelter if we don't have one
        if (targetShelter == null) {
            double minDistance = Double.MAX_VALUE;
            for (Object obj : context.getObjects(geography.agents.Shelter.class)) {
                geography.agents.Shelter shelter = (geography.agents.Shelter) obj;
                org.locationtech.jts.geom.Point shelterPoint = (org.locationtech.jts.geom.Point) geography.getGeometry(shelter);
                double dist = myPoint.distance(shelterPoint);
                if (dist < minDistance) {
                    minDistance = dist;
                    targetShelter = shelter;
                }
            }

            // Network Intersection Selection
            if (targetShelter != null) {
                double minStreetDist = Double.MAX_VALUE;
                org.locationtech.jts.geom.Geometry closestStreetGeom = null;
                geography.agents.PortlandStreet currentSelectedStreet = null;

                for (Object obj : context.getObjects(geography.agents.PortlandStreet.class)) {
                    geography.agents.PortlandStreet street = (geography.agents.PortlandStreet) obj;
                    
                    if (street == lastVisitedStreet) {
                        continue;
                    }

                    org.locationtech.jts.geom.Geometry streetGeom = geography.getGeometry(street);
                    double distToStreet = myPoint.distance(streetGeom);
                    
                    if (distToStreet < minStreetDist) {
                        minStreetDist = distToStreet;
                        closestStreetGeom = streetGeom;
                        currentSelectedStreet = street;
                    }
                }

                if (closestStreetGeom != null) {
                    lastVisitedStreet = currentSelectedStreet; 
                    currentPathCoords = new java.util.ArrayList<org.locationtech.jts.geom.Coordinate>();
                    
                    org.locationtech.jts.geom.Coordinate[] coords = closestStreetGeom.getCoordinates();
                    org.locationtech.jts.geom.Point shelterPoint = (org.locationtech.jts.geom.Point) geography.getGeometry(targetShelter);
                    
                    double startDistToShelter = coords[0].distance(shelterPoint.getCoordinate());
                    double endDistToShelter = coords[coords.length - 1].distance(shelterPoint.getCoordinate());

                    if (startDistToShelter > endDistToShelter) {
                        for (int i = 0; i < coords.length; i++) {
                            currentPathCoords.add(coords[i]);
                        }
                    } else {
                        for (int i = coords.length - 1; i >= 0; i--) {
                            currentPathCoords.add(coords[i]);
                        }
                    }
                    currentPathIndex = 0;
                }
            }
        }

        //Travel along the street's coordinate path array
        if (currentPathCoords != null && !currentPathCoords.isEmpty()) {
            org.locationtech.jts.geom.Coordinate nextTargetCoord = currentPathCoords.get(currentPathIndex);
            org.locationtech.jts.geom.Point nextTargetPoint = fac.createPoint(nextTargetCoord);
            
            double distanceToNextNode = myPoint.distance(nextTargetPoint);

            if (distanceToNextNode < 0.0002) {
                currentPathIndex++;
                
                if (currentPathIndex >= currentPathCoords.size()) {
                    org.locationtech.jts.geom.Point shelterPoint = (org.locationtech.jts.geom.Point) geography.getGeometry(targetShelter);
                    
                    if (myPoint.distance(shelterPoint) < 0.002) {
                        System.out.println(this.toString() + " reached destination shelter via street lines and exited.");
                        context.remove(this);
                    } else {
                        targetShelter = null;
                        currentPathCoords = null;
                    }
                    return;
                }
                nextTargetCoord = currentPathCoords.get(currentPathIndex);
            }

            // Standard step movement along the street 
            double speed = 0.00015; 
            double dx = nextTargetCoord.x - myCoord.x;
            double dy = nextTargetCoord.y - myCoord.y;
            double angle = Math.atan2(dy, dx);

            double newX = myCoord.x + speed * Math.cos(angle);
            double newY = myCoord.y + speed * Math.sin(angle);

            geography.move(this, fac.createPoint(new org.locationtech.jts.geom.Coordinate(newX, newY)));
        } else if (targetShelter != null) {
            context.remove(this);
        }
    }
	

//	@ScheduledMethod(start=1, interval=1, pick=1)
	/**
	 * Writes random data to the "My Coverage" coverage.
	 */
	public void testCoverageWrite() {
		Context context = ContextUtils.getContext(this);
		Geography<GisAgent> geography = (Geography)context.getProjection("Geography");
	
		WritableGridCoverage2D coverage = (WritableGridCoverage2D)geography.getCoverage("My coverage");
			
		int x = RandomHelper.nextIntFromTo(0,9);
		int y = RandomHelper.nextIntFromTo(0,9);

		double val = RandomHelper.nextDoubleFromTo(0, 10);
		
		GridCoordinates2D coord = new GridCoordinates2D(x, y);
		
		coverage.setValue(coord, val);
		double[] read = null;
		
		// Test read some random part of the coverage
		double xx = RandomHelper.nextDoubleFromTo(coverage.getEnvelope2D().getMinX(),
				coverage.getEnvelope2D().getMaxX());
		double yy = RandomHelper.nextDoubleFromTo(coverage.getEnvelope2D().getMinY(),
				coverage.getEnvelope2D().getMaxY());
		
		DirectPosition pos = new DirectPosition2D(xx,yy);
		read = coverage.evaluate(pos, read);
	}
	
//	@ScheduledMethod(start=100, pick=1)
	public void testdelete() {
		Context context = ContextUtils.getContext(this);
		Geography<GisAgent> geography = (Geography)context.getProjection("Geography");
	
		WritableGridCoverage2D coverage = (WritableGridCoverage2D)geography.getCoverage("My indexed coverage");
		
		geography.removeCoverage("My indexed coverage");
		
	}
	
//	@ScheduledMethod(start=1, interval=1)
	public void testCoverageReadWrite2() {
		Context context = ContextUtils.getContext(this);
		Geography<GisAgent> geography = (Geography)context.getProjection("Geography");
	
		WritableGridCoverage2D coverage = (WritableGridCoverage2D)geography.getCoverage("My indexed coverage");
		
		if (coverage == null) return;
		
		Coordinate loc = geography.getGeometry(this).getCoordinate();

		double val = 0;

		DirectPosition pos = new DirectPosition2D(loc.x, loc.y);
		
		if (!coverage.getEnvelope2D().contains(pos)) 
			return;
		
		double[] gridVal = null;
		gridVal = coverage.evaluate(pos, gridVal);
		
		int max = 3;  // max coverage index value
		
		if (gridVal != null) {
			val = gridVal[0] + 1;
		}
		if (val > max) val = max;  
		
		coverage.setValue(pos, val);
	}
	
//	@ScheduledMethod(start=1, interval=1)
	public void testCoverageReadWrite3() {
		Context context = ContextUtils.getContext(this);
		Geography<GisAgent> geography = (Geography)context.getProjection("Geography");
	
		WritableGridCoverage2D coverage = (WritableGridCoverage2D)geography.getCoverage("My indexed coverage 2");
		
		Coordinate loc = geography.getGeometry(this).getCoordinate();

		int val = 0;

		DirectPosition pos = new DirectPosition2D(loc.x, loc.y);
		
		if (!coverage.getEnvelope2D().contains(pos)) 
			return;
		
		int[] gridVal = null;
		gridVal = coverage.evaluate(pos, gridVal);
		
		if (gridVal != null) {
			val = gridVal[0] + 1;
		}
		if (val > 10) 
			val = 10;   
		
		coverage.setValue(pos, val);
	}
	
	/**
	 * Random walk the agent around.
	 */
	private void randomWalk(){
		Context context = ContextUtils.getContext(this);
		Geography<GisAgent> geography = (Geography)context.getProjection("Geography");

		geography.moveByDisplacement(this, RandomHelper.nextDoubleFromTo(-0.0005, 0.0005), 
				RandomHelper.nextDoubleFromTo(-0.0005, 0.0005));
	}

	public String getName() {
		return name;
	}

	@Override
	public String toString(){
		return name;
	}

	public boolean isWater() {
		return water;
	}

	public void setWater(boolean water) {
		this.water = water;
	}

	public double getWaterRate() {
		return waterRate;
	}

	public void setWaterRate(double waterRate) {
		this.waterRate = waterRate;
	}
}