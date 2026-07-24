package geography.agents;

/**
 * An unsheltered resident of Multnomah County, represented as a GIS point
 * agent. Each tick (from tick 30) the agent seeks the straight-line-nearest
 * {@link Shelter}, hops to the nearest street segment, and walks the street's
 * vertices toward the shelter.
 *
 * Known limitations tracked in PROJECT_ASSESSMENT.md (Phase 4 roadmap):
 * movement is greedy segment-hopping, not shortest-path routing on a street
 * graph (commit 4); distances/speeds are in raw degrees, not metres
 * (commit 3); the agent removes itself from the context both on arrival and
 * on path failure, which destroys outcome measurement (commit 5).
 */
public class GisAgent {

	private geography.agents.Shelter targetShelter = null;
	private String name;

	public GisAgent(String name) {
		this.name = name;
	}

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

	public String getName() {
		return name;
	}

	@Override
	public String toString(){
		return name;
	}
}
