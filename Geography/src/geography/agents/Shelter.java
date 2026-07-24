package geography.agents;

public class Shelter {
    private String id;
    private int capacity;

    public Shelter(String id, int capacity) {
        this.id = id;
        this.capacity = capacity;
    }

    public String getId() {
        return id;
    }

    public int getCapacity() {
        return capacity;
    }
}