package geography.agents;

public class PortlandStreet {


	private String name;
	private double length;
	
	public PortlandStreet(String name, double length){
		this.name = name;
		this.length = length;
	}

	public String getName() {
		return name;
	}

	public void setName(String name) {
		this.name = name;
	}
	public double getLength() {
		return length;
	}

	public void setLength(double length) {
		this.length = length;
	}

}
